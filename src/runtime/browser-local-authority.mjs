import {normalizedScope,tokenOK} from '../b1/identity.mjs';
/** A document-local display capability, deliberately without principal/context
 * receipts. It never calls identity providers; personal storage requires an
 * explicit private binding. Navigation continuity uses a one-use native intent. */
export function createBrowserLocalAuthority({allowedURL,now=Date.now,makeId=()=>crypto.randomUUID(),onDiscard=()=>{}}={}){
 const entries=new Map();let epoch=0;
 const valid=f=>f&&Number.isSafeInteger(f.tabId)&&f.tabId>=0&&f.frameId===0&&tokenOK(f.documentId)&&f.incognito===false&&f.documentLifecycle==='active'&&allowedURL(f.actualURL);
 const key=f=>JSON.stringify([f.tabId,f.documentId]);
 const deny=()=>({state:'unverified',reason:'browser-local-document-unavailable'});
 function remove(k){const entry=entries.get(k);if(entry){entries.delete(k);onDiscard(entry.scope.key);}}
 function peek(frame){
  if(!valid(frame))return deny();const e=entries.get(key(frame));
  if(!e||e.url!==frame.actualURL)return deny();
  if(now()<e.issued||now()>=Date.parse(e.grant.expiresAt)){remove(key(frame));return deny();}
  return {state:'verified',grant:e.grant};
 }
 function issue(frame,signal){
  if(signal?.aborted||!valid(frame))return Promise.resolve(deny());
  const k=key(frame);let e=entries.get(k);
  if(e&&e.url!==frame.actualURL){remove(k);e=null;}
  for(const [id,row]of entries)if(now()>=Date.parse(row.grant.expiresAt))remove(id);
  e=entries.get(k);
  if(!e){
   if(entries.size>=32)return Promise.resolve(deny());
   const scope=normalizedScope({kind:'browser-local',storage:'session',spaceId:makeId()});
   if(!scope)throw Error('invalid-local-space-id');
   e={scope,url:frame.actualURL,tabId:frame.tabId,documentId:frame.documentId,epoch:++epoch,id:makeId()};
   if(!tokenOK(e.id))throw Error('invalid-local-grant-id');entries.set(k,e);
  }
  e.issued=now();e.grant=Object.freeze({kind:'browser-local-session',id:e.id,scopeKey:e.scope.key,scopeEpoch:e.epoch,
   issuedAt:new Date(e.issued).toISOString(),expiresAt:new Date(e.issued+60000).toISOString(),
   storage:e.scope.storage==='personal'?'explicit-local-personal':'memory-only',serverIdentity:'NOT_ESTABLISHED'});
  return Promise.resolve({state:'verified',grant:e.grant});
 }
 return Object.freeze({isIdle:()=>true,peek,refresh:(frame,_reason,signal)=>issue(frame,signal),revalidate:issue,sourceFor:()=>null,
  bindPersonal(frame,spaceId){
   if(!valid(frame)||!tokenOK(spaceId))throw Error('invalid-local-personal-binding');
   // Called only after the private popup confirms this exact browser document.
   // No descriptor or persisted grant may restore this selection automatically.
   const k=key(frame);remove(k);const scope=normalizedScope({kind:'browser-local',storage:'personal',spaceId});
   const id=makeId();if(!tokenOK(id))throw Error('invalid-local-grant-id');
   const at=now();entries.set(k,{scope,url:frame.actualURL,tabId:frame.tabId,documentId:frame.documentId,epoch:++epoch,id,issued:at,
    grant:{expiresAt:new Date(at+60000).toISOString()}});
   return issue(frame);
  },
  prepareNavigation(frame,target){
   const current=peek(frame),e=entries.get(key(frame));
   if(current.state!=='verified'||!allowedURL(target))return false;
   e.navigation={target,until:now()+6000,actionId:makeId()};return true;
  },
  takeArrival(frame){const e=entries.get(key(frame));if(peek(frame).state!=='verified')return null;const a=e.arrival;delete e.arrival;return a&&now()<a.until?a:null;},
  scopeFor(frame){return peek(frame).state==='verified'?entries.get(key(frame)).scope:null;},
  invalidate(documentId){for(const [k,e]of entries)if(e.documentId===documentId)remove(k);},
  invalidateTab(tabId,navigation=null){
   for(const [k,e]of entries)if(e.tabId===tabId){
    const intent=e.navigation;delete e.navigation;
    if(navigation&&navigation.documentId===e.documentId&&navigation.documentLifecycle==='active'&&intent?.target===navigation.url&&now()<intent.until&&now()>=e.issued&&now()<Date.parse(e.grant.expiresAt)){
     // Revoke old grant/epoch, retain only the same explicitly selected local
     // store for this single native navigation within the same live document.
     e.arrival={actionId:intent.actionId,until:intent.until};e.url=navigation.url;e.epoch=++epoch;e.id=makeId();
     void issue({tabId,frameId:0,documentId:e.documentId,actualURL:e.url,documentLifecycle:'active',incognito:false});
    }else remove(k);
   }
  },
  invalidateAll(){for(const k of [...entries.keys()])remove(k);}});
}
