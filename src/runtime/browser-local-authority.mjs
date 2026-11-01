import {normalizedScope,tokenOK} from '../b1/identity.mjs';
/** A document-local display capability, deliberately without principal/context
 * receipts. It never calls identity providers; personal storage requires an
 * explicit private binding. Same-document continuity is separate from one-use activity intents. */
export function createBrowserLocalAuthority({allowedURL,now=Date.now,makeId=()=>crypto.randomUUID(),onDiscard=()=>{}}={}){
 const entries=new Map(),issuedGrants=new WeakMap();let epoch=0;
 const valid=f=>f&&Number.isSafeInteger(f.tabId)&&f.tabId>=0&&f.frameId===0&&tokenOK(f.documentId)&&f.incognito===false&&f.documentLifecycle==='active'&&allowedURL(f.actualURL);
 const key=f=>JSON.stringify([f.tabId,f.documentId]);
 const deny=()=>({state:'unverified',reason:'browser-local-document-unavailable'});
 function remove(k){const entry=entries.get(k);if(entry){entries.delete(k);onDiscard(entry.scope.key);}}
 function peek(frame){
  if(!valid(frame))return deny();const e=entries.get(key(frame));
  if(!e||e.routePending||e.url!==frame.actualURL)return deny();
  if(now()<e.issued||now()>=e.selectionUntil){remove(key(frame));return deny();}
  if(now()>=Date.parse(e.grant.expiresAt))return deny();
  return {state:'verified',grant:e.grant};
 }
 function issue(frame,signal){
  if(signal?.aborted||!valid(frame))return Promise.resolve(deny());
  const k=key(frame);let e=entries.get(k);
  for(const [id,row]of entries)if(now()<row.issued||now()>=row.selectionUntil)remove(id);
  e=entries.get(k);
  // The content handshake can beat webNavigation's same-document event. Do
  // not turn that ordering into deletion of the document's admitted objects.
  // Neither the old nor new route may use the held selection until the browser
  // event advances it. A replacement/risk still discards it normally.
  if(e&&(e.routePending||e.url!==frame.actualURL)){e.routePending=true;return Promise.resolve(deny());}
  if(!e){
   if(entries.size>=32)return Promise.resolve(deny());
   const scope=normalizedScope({kind:'browser-local',storage:'session',spaceId:makeId()});
   if(!scope)throw Error('invalid-local-space-id');
   e={scope,url:frame.actualURL,tabId:frame.tabId,documentId:frame.documentId,epoch:++epoch,id:makeId(),selectionUntil:now()+43200000};
   if(!tokenOK(e.id))throw Error('invalid-local-grant-id');entries.set(k,e);
  }
  e.issued=now();e.grant=Object.freeze({kind:'browser-local-session',id:e.id,scopeKey:e.scope.key,scopeEpoch:e.epoch,
   issuedAt:new Date(e.issued).toISOString(),expiresAt:new Date(e.issued+60000).toISOString(),
   storage:e.scope.storage==='personal'?'explicit-local-personal':'memory-only',serverIdentity:'NOT_ESTABLISHED'});
  issuedGrants.set(e.grant,e);return Promise.resolve({state:'verified',grant:e.grant});
 }
 // Concurrent focus and renewal can issue different immutable snapshots of
 // the same local selection. Accept only an actually issued, still-unexpired
 // snapshot of that exact entry/epoch; this never extends its original lease.
 function isCurrentGrant(frame,grant){
  const e=valid(frame)&&entries.get(key(frame));
  return !!e&&!!grant&&issuedGrants.get(grant)===e&&peek(frame).state==='verified'&&grant.id===e.id&&grant.scopeEpoch===e.epoch&&grant.scopeKey===e.scope.key&&now()>=Date.parse(grant.issuedAt)&&now()<Date.parse(grant.expiresAt);
 }
 return Object.freeze({isIdle:()=>true,peek,isCurrentGrant,refresh:(frame,_reason,signal)=>issue(frame,signal),revalidate:issue,sourceFor:()=>null,
  bindPersonal(frame,spaceId,selectionUntil=now()+43200000){
   if(!valid(frame)||!tokenOK(spaceId)||!Number.isFinite(selectionUntil)||selectionUntil<=now()||selectionUntil>now()+43200000)throw Error('invalid-local-personal-binding');
   // Called only after the private popup confirms this exact browser document.
   // A worker may also call this after the private same-document continuity check.
   // Neither a durable descriptor nor storage.session alone authorizes it.
   const k=key(frame);remove(k);const scope=normalizedScope({kind:'browser-local',storage:'personal',spaceId});
   const id=makeId();if(!tokenOK(id))throw Error('invalid-local-grant-id');
   const at=now();entries.set(k,{scope,url:frame.actualURL,tabId:frame.tabId,documentId:frame.documentId,epoch:++epoch,id,issued:at,selectionUntil,
    grant:{expiresAt:new Date(at+60000).toISOString()}});
   return issue(frame);
  },
  prepareNavigation(frame,target){
   const current=peek(frame),e=entries.get(key(frame));
   if(current.state!=='verified'||!allowedURL(target))return false;
   e.navigation={target,until:now()+6000,actionId:makeId()};return true;
  },
  prepareDocumentNavigation(frame,target){
   // A content sender's URL can be its pre-SPA URL. The authority already owns
   // the latest browser-confirmed route for this exact live document. Do not
   // add an asynchronous frame lookup between a native click and its arrival.
   const e=valid(frame)&&entries.get(key(frame));
   if(!e)return false;return this.prepareNavigation({...frame,actualURL:e.url},target);
  },
  takeArrival(frame){const e=entries.get(key(frame));if(peek(frame).state!=='verified')return null;const a=e.arrival;delete e.arrival;return a&&now()<a.until?a:null;},
  scopeFor(frame){return peek(frame).state==='verified'?entries.get(key(frame)).scope:null;},
  invalidate(documentId){for(const [k,e]of entries)if(e.documentId===documentId)remove(k);},
  invalidateTab(tabId,navigation=null){
   for(const [k,e]of entries)if(e.tabId===tabId){
    const intent=e.navigation;delete e.navigation;
    if(navigation&&navigation.documentId===e.documentId&&navigation.documentLifecycle==='active'&&allowedURL(navigation.url)&&now()>=e.issued&&now()<e.selectionUntil){
     // Revoke old grant/epoch, retain only the same explicitly selected local
     // store within this still-confirmed live document. Only actual matching
     // activation gets an activity arrival; search/new-chat routing does not.
     delete e.routePending;delete e.arrival;if(intent?.target===navigation.url&&now()<intent.until)e.arrival={actionId:intent.actionId,until:intent.until};e.url=navigation.url;e.epoch=++epoch;e.id=makeId();
     void issue({tabId,frameId:0,documentId:e.documentId,actualURL:e.url,documentLifecycle:'active',incognito:false});
    }else remove(k);
   }
  },
  hasPersonalSelection(frame){const e=valid(frame)&&entries.get(key(frame));return !!e&&!e.routePending&&e.url===frame.actualURL&&e.scope.storage==='personal'&&now()>=e.issued&&now()<e.selectionUntil;},
  // Presence is not an access grant. Used only to avoid re-binding/discarding
  // a live document while its trusted route event is pending.
  hasDocumentSelection(frame){const e=valid(frame)&&entries.get(key(frame));return !!e&&now()>=e.issued&&now()<e.selectionUntil;},
  frames:()=>[...entries.values()].map(e=>({tabId:e.tabId,documentId:e.documentId})),
  invalidateAll(){for(const k of [...entries.keys()])remove(k);}});
}
