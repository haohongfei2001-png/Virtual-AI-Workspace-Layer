import {rm} from 'node:fs/promises';
/** Test-only cleanup for the launcher-created disposable profile. */
export async function cleanupIsolatedBrowser({browser,child,profileDir,remove=rm,waitMs=2000}){
 const errors=[],exited=()=>child.exitCode!==null||child.signalCode!=null;
 async function stop(signal){if(!child.pid||exited())return;await new Promise((resolve,reject)=>{let timer;const finish=()=>{clearTimeout(timer);child.removeListener('exit',finish);resolve();};child.once('exit',finish);timer=setTimeout(()=>{child.removeListener('exit',finish);resolve();},waitMs);try{child.kill(signal);}catch(e){clearTimeout(timer);child.removeListener('exit',finish);reject(e);}});}
 try{await browser?.close();}catch(e){errors.push(e);}
 try{await stop('SIGTERM');await stop('SIGKILL');if(child.pid&&!exited())throw Error('isolated-chrome-cleanup-still-running');}catch(e){errors.push(e);}
 // Chromium descendants may finish writes just after main exit. Retry only the
 // newly-created profile with Node's bounded ENOTEMPTY/EBUSY recovery.
 if(!child.pid||exited())try{await remove(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'isolated-browser-cleanup-failed');
}
/** Finish every owned resource even when an earlier close fails. */
export async function cleanupOwnedResources(report,steps){
 const errors=[];for(const [name,close]of steps)try{await close();}catch(error){errors.push({name,error:error?.stack??String(error)});}
 if(errors.length){report.statusBeforeCleanup=report.status;report.status='FAIL_CLEANUP';report.cleanupErrors=errors;return false;}return true;
}
