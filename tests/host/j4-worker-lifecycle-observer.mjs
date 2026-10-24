/** Browser-domain event subscription only; never attaches to or starts a worker. */
export async function observeJ4WorkerLifecycle(session,extensionId,{now=Date.now,timeoutMs=1500,ownsSession=false}={}){
 if(!/^[a-p]{32}$/.test(extensionId)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>1500)throw Error('invalid-j4-lifecycle-observer');
 const origin='chrome-extension://'+extensionId,rows=[],registrations=new Set(),versions=new Set();let dropped=0,closed=false,enabled=false,setup='PENDING',enableFailureReason=null;
 const add=row=>{if(closed)return;if(rows.length===128){rows.shift();dropped++;}rows.push({observedAt:now(),...row});};
 const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)?v:null;
 const registration=({registrations:list=[]})=>{for(const r of list){if(typeof r.scopeURL!=='string'||!r.scopeURL.startsWith(origin+'/'))continue;if(registrations.size<128)registrations.add(r.registrationId);add({event:'registration',registrationId:token(r.registrationId),deleted:r.isDeleted===true});}};
 const version=({versions:list=[]})=>{for(const v of list){if(v.scriptURL!==origin+'/extension/worker.mjs'&&!versions.has(v.versionId)&&!registrations.has(v.registrationId))continue;if(versions.size<128)versions.add(v.versionId);add({event:'version',versionId:token(v.versionId),registrationId:token(v.registrationId),targetId:token(v.targetId),runningStatus:['stopped','starting','running','stopping'].includes(v.runningStatus)?v.runningStatus:null,status:['new','installing','installed','activating','activated','redundant'].includes(v.status)?v.status:null});}};
 session.on('ServiceWorker.workerRegistrationUpdated',registration);session.on('ServiceWorker.workerVersionUpdated',version);
 let timer;const pending=Promise.resolve().then(()=>session.send('ServiceWorker.enable')).then(()=>{enabled=true;if(setup==='PENDING')setup='ENABLED';if(closed)void session.send('ServiceWorker.disable').catch(()=>{});},error=>{if(setup==='PENDING'){setup='ENABLE_ERROR';enableFailureReason=classifyJ4LifecycleSetupError(error);}});
 await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>{setup='ENABLE_TIMEOUT';enableFailureReason='ENABLE_TIMEOUT';resolve();},timeoutMs);})]);clearTimeout(timer);
 return {mark(stage){if(['before-disable','disabled','before-enable','enabled','before-reload','reloaded','fresh-grant-timeout'].includes(stage))add({event:'boundary',stage});},snapshot(){return {kind:'PASSIVE_BROWSER_WORKER_LIFECYCLE_NOT_RECEIPT_EVIDENCE',setup,enableFailureReason,sessionScope:ownsSession?'EXISTING_PAGE':'CALLER_SUPPLIED',dropped,truncated:dropped>0,versionEventTimeMeaning:'RECEIPT_TIME_MAY_INCLUDE_EXISTING_VERSION_SNAPSHOT_NOT_START_TIME',rows:rows.map(r=>({...r})),limitation:'Browser version events do not prove listener readiness, receipt delivery, or content association.'};},async stop(){if(closed)return;closed=true;session.off('ServiceWorker.workerRegistrationUpdated',registration);session.off('ServiceWorker.workerVersionUpdated',version);if(enabled){let timer;try{await Promise.race([session.send('ServiceWorker.disable'),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);}catch{}finally{clearTimeout(timer);}}if(ownsSession)await detachJ4LifecycleSession(session,timeoutMs);}};
}

export function classifyJ4LifecycleSetupError(error){
 const message=typeof error?.message==='string'?error.message:'';
 if(message==='j4-page-session-acquire-timeout')return 'SESSION_ACQUIRE_TIMEOUT';
 if(/wasn't found|method not found|unknown method|not supported/i.test(message))return 'METHOD_UNAVAILABLE';
 if(/closed|detached|destroyed/i.test(message))return 'SESSION_CLOSED';
 return 'OTHER_SETUP_ERROR';
}
async function detachJ4LifecycleSession(session,timeoutMs){let timer;try{await Promise.race([Promise.resolve().then(()=>session.detach()),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);}catch{}finally{clearTimeout(timer);}}
/** Attach only to the already-existing native page, never to a worker target. */
export async function observeJ4PageWorkerLifecycle(context,page,extensionId,{timeoutMs=1500,...options}={}){
 if(!/^[a-p]{32}$/.test(extensionId)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>1500)throw Error('invalid-j4-lifecycle-observer');
 let expired=false,timer,session;const acquire=Promise.resolve().then(()=>context.newCDPSession(page));
 acquire.then(value=>{if(expired)void detachJ4LifecycleSession(value,timeoutMs);},()=>{});
 try{session=await Promise.race([acquire,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('j4-page-session-acquire-timeout'));},timeoutMs);})]);}
 catch(error){session={on(){},off(){},send:async()=>{throw error;},detach:async()=>{}};}
 finally{clearTimeout(timer);}
 return observeJ4WorkerLifecycle(session,extensionId,{...options,timeoutMs,ownsSession:true});
}
