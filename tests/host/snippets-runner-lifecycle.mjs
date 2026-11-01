import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';

/** Test-runner paths only; never select an existing browser profile. */
export function snippetsRunnerPaths({env=process.env,platform=process.platform,temp=tmpdir(),output}={}){
 const executablePath=env.FREE_CHROME_EXECUTABLE??(platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':platform==='linux'?'/usr/bin/chromium':null);
 if(typeof executablePath!=='string'||!executablePath.trim())throw Error('Set FREE_CHROME_EXECUTABLE to the isolated test browser executable');
 return {executablePath,tempPrefix:join(temp,'vaiwl-snippets-package-'),output:output??join(temp,'host-snippets-package-mv3.json')};
}
const describe=error=>error?.stack??String(error);

/** Own resources as soon as acquired. A failure cannot skip later cleanup,
 * integrity checks, or the report attempt. Only the caller runs browser steps. */
export async function runSnippetsLifecycle({report,output,execute,inspectFailure=async()=>{},integrityChecks=[],writeReport=writeFile,diagnostic=message=>console.error(message)}){
 const cleanup=[];
 const fail=(stage,error)=>{
  const text=describe(error);
  (report.lifecycleErrors??=[]).push({stage,error:text});
  report.error??=text;
  if(report.status!=='FAIL_CLEANUP')report.status='FAIL';
 };
 try{
  await execute({own:(name,close)=>cleanup.unshift([name,close])});
  report.status='PASS';
 }catch(error){
  fail('execute',error);
  try{await inspectFailure(error);}catch(failure){fail('failure-diagnostics',failure);}
 }
 await cleanupOwnedResources(report,cleanup);
 for(const [name,check]of integrityChecks)try{await check();}catch(error){fail(name,error);}
 let reportWritten=false;
 try{await writeReport(output,JSON.stringify(report,null,2)+'\n');reportWritten=true;}
 catch(error){fail('report-write',error);report.reportWriteError=describe(error);}
 if(!reportWritten)diagnostic('SNIPPETS_REPORT_WRITE_FAILED '+JSON.stringify({output,report}));
 return {report,reportWritten,exitCode:report.status==='PASS'?0:1};
}
