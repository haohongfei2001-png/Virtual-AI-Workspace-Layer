import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from '../host/contract.mjs';
const providerId='chatgpt-session-v1';
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
/** Worker-only, one-use document challenges. Dispatch replies never confer identity. */
export function createIsolatedSessionOwner({extensionId,handshake,getFrame,dispatch,origin,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID(),maxPending=128}={}){
 if(!tokenOK(extensionId)||!handshake||!['verify','matchesFrame'].every(k=>typeof handshake[k]==='function')||typeof getFrame!=='function'||typeof dispatch!=='function'||typeof origin!=='string'||new URL(origin).origin!==origin||!['http:','https:'].includes(new URL(origin).protocol)||![now,elapsedNow,schedule,cancel,makeId].every(f=>typeof f==='function')||!Number.isInteger(maxPending)||maxPending<1||maxPending>128)throw Error('invalid-isolated-session-owner');
 const pending=new Map(),documents=new Map();let active=true,sequence=0;
 const fields=['documentToken','producerToken','routeEpoch','authorityEpoch'];
 function frameOK(frame,sender){
  try{return Number.isSafeInteger(frame?.tabId)&&frame.tabId>=0&&frame.frameId===0&&tokenOK(frame.documentId)&&frame.documentLifecycle==='active'&&frame.incognito===false&&new URL(frame.actualURL).origin===origin&&new URL(frame.actualURL).username===''&&new URL(frame.actualURL).password===''&&sender?.id===extensionId&&sender.tab?.id===frame.tabId&&sender.tab.incognito!==true&&sender.frameId===0&&sender.documentId===frame.documentId&&sender.documentLifecycle==='active'&&new URL(sender.url).origin===origin&&new URL(sender.url).username===''&&new URL(sender.url).password==='';}catch{return false;}
 }
 function settle(entry,error,value){
  if(pending.get(entry.challenge)!==entry)return;
  pending.delete(entry.challenge);documents.delete(entry.key);cancel(entry.timer);entry.signal?.removeEventListener('abort',entry.onAbort);
  if(error)entry.reject(Error(error));else entry.resolve(value);
 }
 function live(entry){
  if(!active||pending.get(entry.challenge)!==entry)return false;
  let wall,elapsed,guard;try{wall=now();elapsed=elapsedNow();guard=entry.isCurrent()===true;}catch{settle(entry,'isolated-session-stale');return false;}
  if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<entry.lastWall||elapsed<entry.lastElapsed||wall>=entry.until||elapsed-entry.started>=entry.remainingMs||entry.signal?.aborted||!guard){settle(entry,'isolated-session-stale');return false;}
  entry.lastWall=wall;entry.lastElapsed=elapsed;return true;
 }
 async function verify(entry,sender){
  if(!live(entry)||!frameOK(entry.frame,sender)||!await handshake.verify(entry.binding,sender)||!live(entry))return false;
  const actual=await getFrame({tabId:entry.frame.tabId,frameId:0});
  return live(entry)&&actual?.documentId===entry.frame.documentId&&actual.frameType==='outermost_frame'&&actual.documentLifecycle==='active'&&actual.errorOccurred!==true&&actual.url===entry.frame.actualURL&&handshake.matchesFrame(entry.binding,sender,actual)===true&&await handshake.verify(entry.binding,sender)&&live(entry);
 }
 function identityOK(value){
  if(!exactHostRecord(value,['principalId','expiresAt','contexts','providerProfile','transport'])||!identifier(value.principalId)||value.providerProfile!==providerId||value.transport!=='isolated-fixed-fetch'||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now()||!Array.isArray(value.contexts)||value.contexts.length>256||Reflect.ownKeys(value.contexts).length!==value.contexts.length+1||Reflect.ownKeys(value.contexts).some(k=>k!=='length'&&(typeof k!=='string'||!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=value.contexts.length)))return false;
  const ids=new Set();for(const context of value.contexts){if(!exactHostRecord(context,['id','kind'])||!identifier(context.id)||!['personal','organization','unknown'].includes(context.kind)||ids.has(context.id))return false;ids.add(context.id);}return true;
 }
 function read(options={}){
  return new Promise((resolve,reject)=>{
   let entry;
   try{
    const {signal,isCurrent,remainingMs,authorityEpoch}=options;
    const frame=structuredClone(options.frame),binding=structuredClone(options.binding),sender=structuredClone(options.sender);
    const wall=now(),started=elapsedNow();
    if(!active||!frameOK(frame,sender)||typeof isCurrent!=='function'||isCurrent()!==true||signal?.aborted||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000||!Number.isSafeInteger(authorityEpoch)||authorityEpoch<1||!Number.isFinite(wall)||!Number.isFinite(started)||!tokenOK(binding?.documentToken)||!tokenOK(binding?.producerToken)||!Number.isSafeInteger(binding?.routeEpoch)||binding.routeEpoch<1||Date.parse(binding.expiresAt)<=wall||!Number.isFinite(Date.parse(binding.expiresAt)))throw Error();
    const key=JSON.stringify([frame.tabId,frame.documentId]);
    if(documents.has(key)||pending.size>=maxPending||!Number.isSafeInteger(sequence+1))throw Error();
    const random=makeId();if(!tokenOK(random))throw Error();const challenge=random.slice(0,100)+'_'+(++sequence).toString(36);
    entry={frame,binding,sender,authorityEpoch,signal,isCurrent,remainingMs,started,lastWall:wall,lastElapsed:started,until:Math.min(wall+remainingMs,Date.parse(binding.expiresAt)),key,challenge,resolve,reject,consumed:false};
    pending.set(challenge,entry);documents.set(key,entry);
    entry.onAbort=()=>settle(entry,'isolated-session-aborted');signal?.addEventListener('abort',entry.onAbort,{once:true});
    entry.timer=schedule(()=>settle(entry,'isolated-session-timeout'),Math.min(remainingMs,entry.until-wall));
    void (async()=>{
     if(!await verify(entry,sender)){settle(entry,'isolated-session-stale');return;}
     const remaining=Math.min(entry.remainingMs-(elapsedNow()-entry.started),entry.until-now());if(!live(entry)||remaining<=0)return;
     const command={type:'HOST_IDENTITY_CHALLENGE',challenge,providerId,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,authorityEpoch,actualURL:frame.actualURL,expiresAt:new Date(entry.until).toISOString(),timeoutMs:remaining};
     // Deliberately ignore even a successful dispatch result; only handle's
     // independently verified runtime sender can complete this request.
     await dispatch(frame,command);
    })().catch(()=>settle(entry,'isolated-session-unavailable'));
   }catch{if(entry)settle(entry,'isolated-session-unavailable');else reject(Error('invalid-isolated-session-read'));}
  });
 }
 async function handle(input,sender){
  try{
   const message=structuredClone(input),actualSender=structuredClone(sender);
   if(!exactHostRecord(message,['type','challenge',...fields,'ok',...(message?.ok===true?['identity']:[])])||message.type!=='HOST_IDENTITY_RESULT'||typeof message.ok!=='boolean')return {ok:false};
   const entry=pending.get(message.challenge);
   if(!entry||entry.consumed||!frameOK(entry.frame,actualSender)||fields.some(k=>message[k]!== (k==='authorityEpoch'?entry.authorityEpoch:entry.binding[k])))return {ok:false};
   if(!await verify(entry,actualSender))return {ok:false};
   // Recheck after asynchronous verification: two replies cannot both consume.
   if(entry.consumed||!live(entry))return {ok:false};entry.consumed=true;
   if(!message.ok||!identityOK(message.identity)){settle(entry,'isolated-session-unavailable');return {ok:false};}
   if(!await verify(entry,actualSender)||!identityOK(message.identity)){settle(entry,'isolated-session-stale');return {ok:false};}
   settle(entry,null,message.identity);return {ok:true};
  }catch{return {ok:false};}
 }
 function stop(){if(!active)return;active=false;for(const entry of [...pending.values()])settle(entry,'isolated-session-stopped');}
 return Object.freeze({read,handle,stop});
}
