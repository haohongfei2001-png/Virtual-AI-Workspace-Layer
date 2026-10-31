/** Additive closeout browser evidence; the inherited unified runner remains
 * the authority for Free regressions, package and production MV3 composition. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),output=resolve(process.env.VAIWL_UNIFIED_EVIDENCE_DIR??join(root,'artifacts/unified-r1'),'pro-closeout');await mkdir(output,{recursive:true});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),sourceSHA=git('rev-parse','HEAD'),status=()=>git('status','--porcelain','--untracked-files=all','--','src','tests','extension','.github/workflows/vaiwl-pro-closeout.yml');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={format:'vaiwl-pro-closeout-browser/1',sourceSHA,sourceStatusBefore:status(),startedAt:new Date().toISOString(),status:'RUNNING',evidenceClass:'ISOLATED_CHROMIUM_SYNTHETIC_DATA',realChatGPT:'NOT_RUN',realModel:'NOT_RUN',personalDevice:'NOT_RUN',steps:[]};
try{
 if(process.env.VAIWL_SOURCE_COMMIT&&process.env.VAIWL_SOURCE_COMMIT!==sourceSHA)throw Error('exact-source-sha-required');
 if(process.env.CI==='true'&&report.sourceStatusBefore)throw Error('CI-source-must-be-clean');
 if(!process.env.PRO_CHROMIUM_EXECUTABLE)throw Error('full-isolated-chromium-required');
 for(const name of ['closeout-ui-browser','closeout-zoom-browser','closeout-history-browser']){
  const started=Date.now(),result=await new Promise(resolve=>{let text='';const child=spawn(process.execPath,['--test-reporter=tap','tests/pro/'+name+'.mjs'],{cwd:root,env:{...process.env,PRO_EVIDENCE_DIR:join(output,name),PRO_UI_SCREENSHOT_DIR:join(output,name)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',e=>text+=e.stack);child.on('close',(code,signal)=>resolve({code,signal,text}));});
  await writeFile(join(output,name+'.log'),result.text);const count=k=>Number(result.text.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??0);
  const passed=result.code===0&&count('tests')>0&&count('fail')===0&&count('skipped')===0&&count('cancelled')===0;
  report.steps.push({name,status:passed?'PASS':'FAIL',elapsedMs:Date.now()-started,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),exitCode:result.code,signal:result.signal,log:name+'.log',logSHA256:hash(result.text)});console.log((passed?'PASS ':'FAIL ')+name);
  if(!passed){console.error(result.text);throw Error('closeout-browser-failed:'+name);}
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{report.sourceStatusAfter=status();report.sourceSHAAfter=git('rev-parse','HEAD');report.sourceMatchesCommit=!report.sourceStatusBefore&&!report.sourceStatusAfter&&report.sourceSHAAfter===sourceSHA;report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
