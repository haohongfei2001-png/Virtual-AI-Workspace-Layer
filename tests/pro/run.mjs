/** Run individual node:test cases directly, retaining their true counts. */
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),browser=process.argv.includes('--browser'),regression=process.argv.includes('--regression');
const browserFiles=new Set(['browser-journey.mjs','ui-browser.mjs']);
const files=(await readdir(join(root,'tests/pro'))).filter(f=>f.endsWith('.test.mjs')||(browser&&browserFiles.has(f))).sort().map(f=>'tests/pro/'+f);
const sharedFiles=['tests/b23/logic.test.mjs','tests/b23/repository.test.mjs','tests/b23/migration.test.mjs','tests/b23/view-isolation.test.mjs','tests/b23/audit-regressions.test.mjs','tests/free/native-repository.test.mjs','tests/free/activity-version-fence.test.mjs','tests/host/free-frame-projection.test.mjs','tests/host/scope-authority-boundaries.test.mjs','tests/host/host-binding-service.test.mjs','tests/host/host-binding-idle.test.mjs','tests/host/host-worker-runtime.test.mjs','tests/host/backup-transfer.test.mjs','tests/host/host-backup-service.test.mjs'];
if(regression)files.push(...sharedFiles);
const results=[];
for(const file of files){const start=performance.now();const output=await new Promise(resolve=>{const child=spawn(process.execPath,['--test-reporter=tap',file],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',error=>resolve({exitCode:1,stdout,stderr:stderr+error.message}));child.on('close',code=>resolve({exitCode:code,stdout,stderr}));});
 const count=kind=>Number(output.stdout.match(new RegExp('^# '+kind+' (\\d+)$','m'))?.[1]??0),row={file,status:output.exitCode===0&&count('fail')===0&&count('tests')>0?'PASS':'FAIL',tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),milliseconds:Math.round(performance.now()-start),cases:[...output.stdout.matchAll(/^(?:ok|not ok) \d+ - (.+)$/gm)].map(m=>m[1])};results.push(row);process.stdout.write(row.status+' '+file+' '+row.passed+'/'+row.tests+'\n');if(row.status==='FAIL')process.stderr.write(output.stdout+output.stderr);
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sources=[];
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const full=join(path,entry.name),rel=relative(root,full);if(rel==='tests/pro/evidence')continue;if(entry.isDirectory())await walk(full);else if(/\.(mjs|ts|json|html|patch)$/.test(entry.name))sources.push({file:rel,sha256:sha(await readFile(full))});}}
await walk(join(root,'src/pro'));await walk(join(root,'tests/pro'));sources.sort((a,b)=>a.file.localeCompare(b.file));
const report={contract:'VAIWL-PRO/1.0',handoffBaseline:'f317b26ea6ed7d1cc249c4bfc0ad90a619d29417',baseline:'2c9b043ce3c65a4b92c6f8f83b59fb416f63132a',verifiedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},browserIncluded:browser,sharedRegressionIncluded:regression,status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',tests:results.reduce((n,x)=>n+x.tests,0),passed:results.reduce((n,x)=>n+x.passed,0),skipped:results.reduce((n,x)=>n+x.skipped,0),sourceDigest:sha(JSON.stringify(sources)),results};
const output=process.env.PRO_EVIDENCE_DIR??join(root,'tests/pro/evidence');await mkdir(output,{recursive:true});await writeFile(join(output,'source-manifest.json'),JSON.stringify({sourceDigest:report.sourceDigest,files:sources},null,2)+'\n');await writeFile(join(output,'test-results.json'),JSON.stringify(report,null,2)+'\n');process.stdout.write('TOTAL '+report.passed+'/'+report.tests+'; skipped '+report.skipped+'; '+report.status+'\n');if(report.status!=='PASS')process.exitCode=1;
