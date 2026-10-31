/** Reproducible candidate evidence. Every report is tied to the actual checkout
 * SHA and before/after source hashes; these are offline engineering checks. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const phase=process.argv[2],allowed=['node','browser','performance','package'];
if(!allowed.includes(phase))throw Error('usage: node tests/integration-unified/run.mjs node|browser|performance|package');
const output=resolve(process.env.VAIWL_UNIFIED_EVIDENCE_DIR??join(root,'artifacts/unified-r1'));
await mkdir(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sha=git('rev-parse','HEAD');
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('exact-source-commit-required');
if(process.env.VAIWL_SOURCE_COMMIT&&process.env.VAIWL_SOURCE_COMMIT!==sha)throw Error('checkout-does-not-match-required-source-commit');
const sourceStatus=()=>git('status','--porcelain','--untracked-files=all','--','src','extension','tests','.github/workflows/vaiwl-unified-r1.yml');
const sourceStatusBefore=sourceStatus();
if(process.env.CI==='true'&&sourceStatusBefore)throw Error('CI-checkout-has-uncommitted-source');
async function walk(directory,predicate=()=>true){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const full=join(directory,entry.name),rel=relative(root,full).split('\\').join('/');
  if(['node_modules','evidence'].includes(entry.name))continue;
  if(entry.isDirectory())files.push(...await walk(full,predicate));
  else if(entry.isFile()&&predicate(rel))files.push(rel);
 }
 return files.sort();
}
async function sourceHashes(){
 const paths=(await Promise.all(['src','extension','tests'].map(dir=>walk(join(root,dir),file=>/\.(?:mjs|js|json|css|html|ts|patch)$/.test(file))))).flat();
 return Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async file=>[file,hash(await readFile(join(root,file)))])));
}
const report={format:'vaiwl-unified-ci/1',phase,sourceSHA:sha,sourceSHAAfter:null,startedAt:new Date().toISOString(),
 environment:{node:process.version,platform:process.platform,arch:process.arch},
 evidenceClass:'OFFLINE_ENGINEERING',realChatGPT:'NOT_RUN',personalMac:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',
 sourceStatusBefore,sourceStatusAfter:null,sourceMatchesCommit:sourceStatusBefore==='',
 sourceHashesBefore:await sourceHashes(),sourceHashesAfter:null,steps:[],status:'RUNNING'};
const env={...process.env,VAIWL_SOURCE_COMMIT:sha,FREE_SOURCE_COMMIT:sha,
 PRO_EVIDENCE_DIR:join(output,'pro'),PRO_UI_SCREENSHOT_DIR:join(output,'pro/ui'),
 VAIWL_PRO_PERFORMANCE_OUTPUT:join(output,'performance.json'),VAIWL_UNIFIED_EVIDENCE_DIR:output};
async function command(name,args,{testCounts=false,extraEnv={}}={}){
 const log=join(output,name+'.log'),started=Date.now();
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,args,{cwd:root,env:{...env,...extraEnv},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',spawnError=null;
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',error=>{spawnError=error.message;});
  child.on('close',(code,signal)=>resolve({code,signal,stdout,stderr,spawnError}));
 });
 await writeFile(log,result.stdout+result.stderr+(result.spawnError?'\n'+result.spawnError+'\n':''));
 const count=name=>Number(result.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]??0);
 const counts=testCounts?{tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')}:null;
 const pass=result.code===0&&!result.spawnError&&(!counts||counts.tests>0&&counts.failed===0&&counts.skipped===0&&counts.cancelled===0);
 report.steps.push({name,args,elapsedMs:Date.now()-started,status:pass?'PASS':'FAIL',exitCode:result.code,signal:result.signal,
  log:relative(output,log),logSHA256:hash(await readFile(log)),...(counts??{})});
 process.stdout.write(`${pass?'PASS':'FAIL'} ${name}${counts?` ${counts.passed}/${counts.tests}`:''}\n`);
 if(!pass){process.stderr.write(result.stdout.slice(-12000)+result.stderr.slice(-12000));throw Error('unified-check-failed:'+name);}
}
try{
 if(phase==='node'){
  const tests=await walk(join(root,'tests'),file=>file.endsWith('.test.mjs'));
  await command('all-node-contracts',['--test','--test-reporter=tap','--test-concurrency=2',...tests],{testCounts:true});
  await command('integrated-shared-owner',['--test-reporter=tap','tests/pro/integration/shared-owner-fixture.mjs'],{testCounts:true});
 }
 if(phase==='browser'){
  if(!env.PRO_CHROMIUM_EXECUTABLE||!env.FREE_CHROME_EXECUTABLE)throw Error('chromium-required-no-skip');
  await command('pro-browser-regression',['tests/pro/run.mjs','--browser','--regression']);
  const pro=JSON.parse(await readFile(join(output,'pro/test-results.json'),'utf8'));
  if(pro.status!=='PASS'||pro.skipped!==0||pro.browserIncluded!==true||pro.sharedRegressionIncluded!==true)throw Error('incomplete-pro-browser-report');
  report.pro={tests:pro.tests,passed:pro.passed,sourceDigest:pro.sourceDigest};
  await command('bounded-remote-ui-browser',['--test-reporter=tap','tests/pro/remote-ui-browser.mjs'],{testCounts:true});
  await command('composite-storage-browser',['--test-reporter=tap','tests/pro/storage-browser.mjs'],{testCounts:true});
  await command('damaged-root-recovery-browser',['--test-reporter=tap','tests/pro/recovery-browser.mjs'],{testCounts:true});
  await command('unified-mv3',['tests/integration-unified/mv3-browser.mjs',join(output,'unified-mv3.json')]);
  const mv3=JSON.parse(await readFile(join(output,'unified-mv3.json'),'utf8'));
  if(mv3.status!=='PASS'||mv3.evidenceClass!=='PACKAGED_MV3_SYNTHETIC_HOST')throw Error('incomplete-unified-mv3-report');
  await command('formal-browser-local',['tests/integration-unified/browser-local.mjs',join(output,'browser-local.json')]);
  const local=JSON.parse(await readFile(join(output,'browser-local.json'),'utf8'));
  if(local.status!=='PASS'||local.packageProfile!=='UNCHANGED_FORMAL_BROWSER_LOCAL'||local.profiles?.length!==2||local.profiles.some(p=>p.status!=='PASS'||p.options?.offlineOrigin))throw Error('incomplete-formal-browser-local-report');
 }
 if(phase==='performance'){
  await command('pro-development-performance',['tests/pro/performance.mjs']);
  const performance=JSON.parse(await readFile(env.VAIWL_PRO_PERFORMANCE_OUTPUT,'utf8'));
  if(performance.changedDuringMeasurement?.length)throw Error('performance-source-changed');
  // Runner hardware varies. Preserve all measurements, including target misses;
  // the report explicitly records them rather than changing product targets.
  report.performance={status:performance.status,measurements:performance.measurements};
 }
 if(phase==='package')await command('unified-packages',['tests/integration-unified/package.mjs',join(output,'packages')]);
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 report.sourceSHAAfter=git('rev-parse','HEAD');report.sourceHashesAfter=await sourceHashes();
 report.sourceStatusAfter=sourceStatus();report.sourceMatchesCommit=report.sourceMatchesCommit&&report.sourceStatusAfter==='';
 report.sourcesStable=report.sourceSHA===report.sourceSHAAfter&&JSON.stringify(report.sourceHashesBefore)===JSON.stringify(report.sourceHashesAfter);
 if(!report.sourcesStable){report.status='FAIL';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await writeFile(join(output,phase+'-report.json'),JSON.stringify(report,null,2)+'\n');
 process.stdout.write(`${phase}: ${report.status}; SHA ${sha}; sources stable ${report.sourcesStable}\n`);
}
