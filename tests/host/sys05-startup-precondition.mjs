// Test-only readiness, never a context receipt or a cold-start acceptance case.
// One absolute budget includes worker discovery, read-only readiness, first
// native navigation and the existing native-context/live-UI predicate.
// hasListeners proves JS registration, not browser network-listener installation
// completion or support for immediate navigation after extension installation.
export function createSys05StartupDeadline({timeoutMs=30000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw Error('sys05-invalid-startup-budget');
 const startedAt=now(),deadlineAt=startedAt+timeoutMs;
 const expired=label=>Error('sys05-timeout:'+label);
 function remaining(label='initial-startup'){const value=deadlineAt-now();if(!Number.isFinite(value)||value<=0||value>timeoutMs)throw expired(label);return value;}
 async function run(task,label){
  const budget=remaining(label);let timer;
  try{
   const result=await Promise.race([Promise.resolve().then(()=>{remaining(label);return task();}),new Promise((_,reject)=>{timer=schedule(()=>reject(expired(label)),budget);})]);
   remaining(label);return result;
  }finally{if(timer!==undefined)cancel(timer);}
 }
 async function poll(read,label){
  for(;;){const result=await run(read,label);if(result)return result;const delay=Math.min(50,remaining(label));await run(()=>new Promise(resolve=>schedule(resolve,delay)),label);}
 }
 return Object.freeze({startedAt,deadlineAt,timeoutMs,remaining,run,poll,elapsedMs:()=>now()-startedAt});
}

export function inspectSys05Worker(extensionId){
 return {extensionId:chrome.runtime.id,expectedIdentity:chrome.runtime.id===extensionId,
  message:chrome.runtime.onMessage.hasListeners(),connect:chrome.runtime.onConnect.hasListeners(),
  sendHeaders:chrome.webRequest.onSendHeaders.hasListeners(),completed:chrome.webRequest.onCompleted.hasListeners(),
  requestError:chrome.webRequest.onErrorOccurred.hasListeners(),redirect:chrome.webRequest.onBeforeRedirect.hasListeners()};
}

export async function waitForSys05Worker(context,extensionId,deadline){
 if(typeof extensionId!=='string'||!extensionId||!/^[a-z0-9_-]+$/i.test(extensionId))throw Error('sys05-invalid-extension-id');
 const exactURL=`chrome-extension://${extensionId}/extension/worker.mjs`;
 const existing=context.serviceWorkers().filter(worker=>worker.url()===exactURL);
 if(existing.length>1)throw Error('sys05-ambiguous-worker');
 const worker=existing[0]??await deadline.run(()=>context.waitForEvent('serviceworker',{predicate:value=>value.url()===exactURL,timeout:deadline.remaining('exact-extension-worker')}),'exact-extension-worker');
 if(worker?.url()!==exactURL)throw Error('sys05-wrong-worker');
 await deadline.poll(async()=>{
  const value=await worker.evaluate(inspectSys05Worker,extensionId);
  if(value?.extensionId!==extensionId||value.expectedIdentity!==true)throw Error('sys05-wrong-worker-identity');
  return ['message','connect','sendHeaders','completed','requestError','redirect'].every(key=>value[key]===true)?value:null;
 },'extension-worker-ready');
 return {kind:'EXACT_WORKER_IDENTITY_AND_REGISTERED_LISTENERS',exactScriptMatched:true,identityMatched:true,registeredHandlers:['message','connect','sendHeaders','completed','requestError','redirect'],browserNetworkListenerInstallation:'NOT_ESTABLISHED',immediateColdSupport:'NOT_ESTABLISHED'};
}
