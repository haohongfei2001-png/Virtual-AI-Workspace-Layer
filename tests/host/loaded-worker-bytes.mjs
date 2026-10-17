import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {connectJ4Debugger} from './j4-debugger-transport.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Error('loaded-worker-'+code);
// Inspect an existing isolated worker only. Debugger source is loaded-code
// evidence, not proof that all module evaluation or application startup finished.
export async function verifyLoadedWorkerBytes({debugEndpoint,extensionId,packagePath},{Socket,budgetMs=10000}={}){
 if(!/^[a-p]{32}$/.test(extensionId)||typeof packagePath!=='string'||!Number.isSafeInteger(budgetMs)||budgetMs<10||budgetMs>19000)throw fail('invalid-input');
 const deadline=Date.now()+budgetMs,targetUrl=`chrome-extension://${extensionId}/extension/worker.mjs`;
 let cdp,sessionId,targetId,timer,revision=0,broken=false,wakeScripts=null;const pending=new Map(),scripts=new Map();let sequence=0;
 const bounded=promise=>{const remaining=deadline-Date.now();return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('deadline')),Math.max(0,remaining));})]).finally(()=>clearTimeout(timer));};
 const rejectPending=()=>{broken=true;wakeScripts?.();for(const request of pending.values())request.reject(fail('target-unavailable'));pending.clear();};
 const receive=e=>{
  if(e.sessionId!==sessionId)return;
  try{const message=JSON.parse(e.message);if(message.id){const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(fail('command-failed')):request.resolve(message.result);}return;}
   if(['Inspector.detached','Runtime.executionContextsCleared'].includes(message.method)){rejectPending();return;}
   if(message.method==='Debugger.scriptParsed'&&scripts.has(message.params?.url)){const rows=scripts.get(message.params.url);if(rows.length<2)rows.push(message.params.scriptId);revision++;wakeScripts?.();}
  }catch{rejectPending();}
 };
 const detach=e=>{if(e.sessionId===sessionId)rejectPending();},destroy=e=>{if(e.targetId===targetId)rejectPending();};
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  if(broken){reject(fail('target-unavailable'));return;}const id=++sequence;pending.set(id,{resolve,reject});
  cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(()=>{pending.delete(id);reject(fail('command-failed'));});
 });
 try{
  const manifest=JSON.parse(await bounded(readFile(join(packagePath,'manifest.json'),'utf8')));
  if(manifest.background?.service_worker!=='extension/worker.mjs'||!['module',undefined].includes(manifest.background?.type))throw fail('invalid-manifest');
  const paths=manifest.background.type==='module'?['extension/worker.mjs','src/data/schema.mjs','src/b1/scope-repository.mjs']:['extension/worker.mjs','extension/classic-runtime.js'];
  const expected=await bounded(Promise.all(paths.map(async path=>{const url=`chrome-extension://${extensionId}/${path}`;scripts.set(url,[]);return {url,sha256:hash(await readFile(join(packagePath,path)))};})));
  // Reserve transport lifetime for detach after the verification deadline.
  cdp=await connectJ4Debugger(debugEndpoint,{...(Socket?{Socket}:{}),budgetMs:Math.min(20000,Math.max(1,deadline-Date.now()+500))});
  const select=async()=>{const {targetInfos}=await cdp.send('Target.getTargets');const matches=targetInfos.filter(row=>row.type==='service_worker'&&row.url===targetUrl);if(matches.length>1)throw fail('multiple-targets');return matches[0]?.targetId??null;};
  // Reload is owned by the caller. Only discover its already-starting worker;
  // no startWorker, evaluation, fetch, or fresh deadline for a retry.
  while(targetId==null){
   if(Date.now()>=deadline)throw fail('target-absent-deadline');
   targetId=await bounded(select());
   if(targetId==null)await new Promise(resolve=>setTimeout(resolve,Math.min(50,Math.max(0,deadline-Date.now()))));
  }
  ({sessionId}=await bounded(cdp.send('Target.attachToTarget',{targetId,flatten:true})));if(typeof sessionId!=='string'||!sessionId)throw fail('invalid-session');
  cdp.on('Target.receivedMessageFromTarget',receive);cdp.on('Target.detachedFromTarget',detach);cdp.on('Target.targetDestroyed',destroy);cdp.on('transportClosed',rejectPending);
  await bounded(send('Debugger.enable'));
  // Debugger.enable may finish before a reloaded worker has parsed its entry
  // and importScripts runtime. Observe only; retain the original total deadline.
  for(;;){
   if(broken)throw fail('target-unavailable');
   const counts=Array.from(scripts.values(),rows=>rows.length);
   if(counts.some(count=>count>1))throw fail('unique-script-required');
   if(counts.every(count=>count===1))break;
   if(Date.now()>=deadline)throw fail('script-absent-deadline');
   await new Promise(resolve=>{let waitTimer;const done=()=>{clearTimeout(waitTimer);wakeScripts=null;resolve();};wakeScripts=done;waitTimer=setTimeout(done,Math.min(50,Math.max(0,deadline-Date.now())));});
  }
  const snapshot=revision,report=[];
  for(const {url,sha256}of expected){
   const matches=scripts.get(url);if(matches.length!==1||typeof matches[0]!=='string')throw fail('unique-script-required');
   const result=await bounded(send('Debugger.getScriptSource',{scriptId:matches[0]}));if(typeof result?.scriptSource!=='string')throw fail('missing-source');
   const loadedSha256=hash(result.scriptSource);if(loadedSha256!==sha256)throw fail('hash-mismatch');report.push({url,expectedSha256:sha256,loadedSha256});
  }
  const finalTarget=await bounded(select());if(finalTarget===null)throw fail('target-absent');
  if(finalTarget!==targetId||broken||revision!==snapshot)throw fail('target-changed');
  return {targetUrl,scripts:report};
 }catch(error){if(error?.message?.startsWith('loaded-worker-')){if(/script/.test(error.message))error.scriptCounts=Object.fromEntries(Array.from(scripts,([url,rows])=>[url.slice(`chrome-extension://${extensionId}/`.length),rows.length]));throw error;}throw fail('verification-failed');}
 finally{
  clearTimeout(timer);
  if(cdp){let cleanupTimer;try{if(sessionId)await Promise.race([cdp.send('Target.detachFromTarget',{sessionId}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);}catch{}finally{clearTimeout(cleanupTimer);cdp.off('Target.receivedMessageFromTarget',receive);cdp.off('Target.detachedFromTarget',detach);cdp.off('Target.targetDestroyed',destroy);cdp.off('transportClosed',rejectPending);rejectPending();cdp.close();}}
 }
}
