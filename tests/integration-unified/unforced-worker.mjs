/** Test-only finite observation using the inherited raw-CDP idle oracle.
 * No worker or page target is attached during the observation. A destruction
 * event is deliberately not called proof of natural-idle causality. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {nativeBrowserArgs,endpointFromActivePort} from '../host/native-visibility-browser.mjs';
import {cleanupIsolatedBrowser} from '../host/isolated-browser-cleanup.mjs';
import {assessIdleObservation,finishIdleObservationDeadline} from '../host/natural-worker-idle-oracle.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function observeUnforcedWorker({chromium,executablePath,profileDir,packagePath,extensionId,networkGuard}){
 const report={windowMs:60000,observationCount:1,forcedWorkerStop:false,workerDebuggerAttached:false,productionTimersModified:false,pageFrozen:false,hostTabs:0};
 let child,socket,browser,ready=false,seq=0,launchError,stderr='',overflow=false;const pending=new Map(),events=[];
 const close=async()=>{socket?.close();if(child)await cleanupIsolatedBrowser({browser,child,profileDir});};
 const command=(method,params={})=>new Promise((resolve,reject)=>{
  if(!ready){reject(Error('unforced-CDP-unavailable'));return;}const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('unforced-CDP-deadline:'+method));},6000);
  pending.set(id,{resolve,reject,timer,method});socket.send(JSON.stringify({id,method,params}));
 });
 async function poll(read,label){const until=performance.now()+15000;while(performance.now()<until){const result=await read();if(result)return result;await sleep(50);}throw Error('unforced-probe-timeout:'+label);}
 try{
  // Remove only this previously closed disposable profile's stale debugger
  // endpoint, never any live browser or user profile.
  await rm(join(profileDir,'DevToolsActivePort'),{force:true});
  // Chrome's Extensions.loadUnpacked command is pipe-only in this pinned
  // version. The official testing browser's startup flag loads exactly the
  // existing package without attaching its worker to a debugger.
  child=spawn(executablePath,[...nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:networkGuard}),`--load-extension=${packagePath}`],{stdio:['ignore','ignore','pipe']});
  child.on('error',error=>{launchError=error;});child.stderr.on('data',value=>{stderr=(stderr+value).slice(-4000);});
  const endpoint=await poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error('unforced-chrome-exited:'+child.exitCode+':'+stderr);try{return endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return null;}},'browser');
  socket=new WebSocket(endpoint);
  socket.addEventListener('message',event=>{
   const value=JSON.parse(event.data);
   if(value.id){const entry=pending.get(value.id);if(entry){pending.delete(value.id);clearTimeout(entry.timer);if(value.error)entry.reject(Error(entry.method+': '+value.error.message));else entry.resolve(value.result);}}
   else if(value.method?.startsWith('Target.')){if(events.length<512)events.push({at:performance.now(),method:value.method,params:value.params});else overflow=true;}
  });
  socket.addEventListener('close',()=>{ready=false;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('unforced-CDP-closed'));}pending.clear();});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('unforced-CDP-connect-deadline')),6000);socket.addEventListener('open',()=>{clearTimeout(timer);ready=true;resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('unforced-CDP-connect-error'));},{once:true});});
  report.browser=await command('Browser.getVersion');await command('Target.setDiscoverTargets',{discover:true});
  report.extensionLoad='UNCHANGED_PACKAGE_STARTUP_FLAG';
  const prefix=`chrome-extension://${extensionId}/`,worker=await poll(async()=>{
   const rows=(await command('Target.getTargets')).targetInfos.filter(target=>target.type==='service_worker'&&target.url===prefix+'extension/worker.mjs');assert(rows.length<=1);return rows[0];
  },'initial-worker');
  const all=(await command('Target.getTargets')).targetInfos,initialTargets=all.filter(target=>target.url.startsWith(prefix));
  assert.equal(all.filter(target=>target.type==='page'&&target.url!=='about:blank').length,0,'the finite observation must have no host or extension page clients');
  for(const target of initialTargets)assert.equal(target.attached,false);
  report.initialTargets=initialTargets;report.initialWorkerId=worker.targetId;
  const started=performance.now(),startEvent=events.length;report.startedWallTime=Date.now();
  console.log('OBSERVE unforced worker: one 60-second window, no host tabs or worker debugger');
  // Only discovery events are received during the fixed window. No target
  // polling, page commands, worker requests, or timer changes occur here.
  await sleep(report.windowMs);
  const ended=await finishIdleObservationDeadline(started,report.windowMs,{now:()=>performance.now(),sleep}),elapsedMs=ended-started;
  const observed=events.slice(startEvent).map(event=>({...event,at:event.at-started}));
  report.endedWallTime=Date.now();report.elapsedMs=elapsedMs;report.events=observed;
  Object.assign(report,assessIdleObservation({...report,prefix,initialWorkerId:worker.targetId,initialTargets,events:observed,eventOverflow:overflow,hostSessionDetached:true}));
  report.validation='VALID';report.hostSessionDetached=true;
  // Only after recording the completed window may Playwright attach page/frame
  // targets and perform the normal host navigation that reacquires live grants.
  browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});const context=browser.contexts()[0];assert(context);
  return {context,report,close};
 }catch(error){try{await close();}catch(cleanupError){throw new AggregateError([error,cleanupError],'unforced-probe-cleanup');}throw error;}
}
