import { isRecord, tokenOK, normalizedScope } from './identity.mjs';

/** Trust Chrome's sender+current frame for document identity, and a separately
 * injected PRIVILEGED account resolver for scope. URL/documentId is not login.
 * This implementation only has a synthetic fixture resolver at B1.
 */
export const VERSION=1;
const deny=reason=>({ok:false,reason});
const exact=(v,keys)=>isRecord(v)&&Object.keys(v).length===keys.length&&
  keys.every(k=>Object.hasOwn(v,k));
const requestOK=m=>{
  if(!isRecord(m)||m.v!==VERSION||!tokenOK(m.clientId)||
     !Number.isSafeInteger(m.seq)||m.seq<1)return false;
  const base=['v','type','clientId','seq'];
  switch(m.type){
    case 'BIND':return exact(m,base);
    case 'CHECK':case 'LIST_REFS':return exact(m,[...base,'leaseId'])&&tokenOK(m.leaseId);
    case 'GET_REF':return exact(m,[...base,'leaseId','conversationId'])&&
      tokenOK(m.leaseId)&&tokenOK(m.conversationId);
    case 'UPSERT_REF':return exact(m,[...base,'leaseId','conversationId','operationId','expectedRevision'])&&
      tokenOK(m.leaseId)&&tokenOK(m.conversationId)&&tokenOK(m.operationId)&&
      Number.isSafeInteger(m.expectedRevision)&&m.expectedRevision>=0;
    default:return false;
  }
};
const isSender=(s,extensionId,allowedURL)=>{
  if(!isRecord(s)||s.id!==extensionId||
     !Number.isSafeInteger(s.tab?.id)||s.tab.id<0||
     s.frameId!==0||!tokenOK(s.documentId)||
     s.documentLifecycle!=='active'||!allowedURL(s.url))return null;
  return Object.freeze({tabId:s.tab.id,frameId:0,documentId:s.documentId,url:s.url});
};
const sameDoc=(a,b)=>a&&b&&a.tabId===b.tabId&&a.frameId===b.frameId&&
  a.documentId===b.documentId&&a.url===b.url;
export const fixtureURL=value=>{
  try {
    if(typeof value!=='string'||value.length>240)return false;
    const u=new URL(value);
    return value===u.href&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&
      !u.username&&!u.password&&!u.search&&!u.hash&&
      /^\/b1-fixture\/[AB]\.html$/.test(u.pathname);
  }catch{return false;}
};
export const fixtureScopeResolver=async ({currentFrame})=>{
  // Strictly synthetic. Never import this resolver into a production adapter.
  if(!fixtureURL(currentFrame.url))return null;
  const accountId=new URL(currentFrame.url).pathname.endsWith('/A.html')?'A':'B';
  return {verified:true,provider:'synthetic_fixture',accountId,organizationId:'test_org'};
};

export function createDocumentBindingBroker({
 extensionId,getFrame,resolveScope,repository,now=Date.now,
 makeId=()=>crypto.randomUUID(),leaseMs=20000,maxTabs=128,allowedURL=fixtureURL
}={}){
  if(!tokenOK(extensionId)||typeof getFrame!=='function'||typeof resolveScope!=='function'||
    !repository||typeof now!=='function'||typeof makeId!=='function'||
    !Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>60000||
    !Number.isSafeInteger(maxTabs)||maxTabs<1||maxTabs>512)throw Error('invalid-broker');
  const states=new Map();
  const tabKey=doc=>doc.tabId+':'+doc.frameId;
  const stateFor=key=>{
    if(!states.has(key))states.set(key,{epoch:0,slot:null});
    return states.get(key);
  };
  function invalidate({tabId,frameId=0}={}){
    if(!Number.isSafeInteger(tabId)||frameId!==0)return false;
    const k=tabId+':0',s=states.get(k);if(!s)return false;
    s.epoch++;s.slot=null;return true;
  }
  function tabClosed(tabId){states.delete(tabId+':0');}
  async function currentDocument(doc){
    try{
      const f=await getFrame({tabId:doc.tabId,frameId:doc.frameId});
      if(!isRecord(f)||!tokenOK(f.documentId)||!allowedURL(f.url)||
        f.errorOccurred===true||(f.documentLifecycle&&f.documentLifecycle!=='active'))return null;
      const actual={tabId:doc.tabId,frameId:doc.frameId,documentId:f.documentId,url:f.url};
      return sameDoc(actual,doc)?actual:null;
    }catch{return null;}
  }
  async function scopeFor(doc,sender){
    try{
      const scope=normalizedScope(await resolveScope({document:doc,currentFrame:doc,sender}));
      return scope;
    }catch{return null;}
  }
  const fresh=(st,slot)=>st.slot===slot&&st.epoch===slot.epoch&&now()<slot.expiresAt;
  const copyRecord=r=>r?{conversationId:r.conversationId,nativeUrl:r.nativeUrl,
    projectId:r.projectId,revision:r.revision}:null;
  async function handle(message,sender){
    if(!requestOK(message))return deny('invalid-request');
    const doc=isSender(sender,extensionId,allowedURL);
    if(!doc)return deny('invalid-sender');
    const key=tabKey(doc),st=stateFor(key),startEpoch=st.epoch;
    if(!(await currentDocument(doc)))return deny('not-current-document');
    if(st.epoch!==startEpoch)return deny('invalidated-during-check');
    const scope=await scopeFor(doc,sender);
    if(!scope)return deny('unverified-scope');
    if(st.epoch!==startEpoch||!(await currentDocument(doc)))return deny('stale-document');
    if(st.epoch!==startEpoch)return deny('invalidated-during-check');
    if(message.type==='BIND'){
      if(st.slot&&sameDoc(st.slot.doc,doc)&&st.slot.clientId===message.clientId&&
         message.seq<=st.slot.seq)return deny('replayed-sequence');
      if(!st.slot&&[...states.values()].filter(v=>v.slot).length>=maxTabs)
        return deny('capacity');
      const leaseId=makeId();
      if(!tokenOK(leaseId))return deny('bad-lease');
      st.epoch++;
      const slot={doc,scope,clientId:message.clientId,seq:message.seq,
        leaseId,expiresAt:now()+leaseMs,epoch:st.epoch};
      st.slot=slot;
      return {ok:true,type:'BOUND',v:VERSION,leaseId,expiresAt:slot.expiresAt,
        documentId:doc.documentId,clientId:message.clientId,seq:message.seq};
    }
    const slot=st.slot;
    if(!slot||!fresh(st,slot)||!sameDoc(slot.doc,doc)||
       slot.leaseId!==message.leaseId||slot.clientId!==message.clientId||
       slot.scope.key!==scope.key||message.seq<=slot.seq)return deny('stale-binding');
    // Every request observes a strictly increasing sequence.
    slot.seq=message.seq;
    if(message.type==='CHECK')return {ok:true,type:'CURRENT',v:VERSION,seq:message.seq};
    try{
      if(message.type==='GET_REF'){
        const record=await repository.get(scope,message.conversationId);
        if(!fresh(st,slot)||!(await currentDocument(doc)))return deny('stale-after-read');
        return {ok:true,type:'REF',record:copyRecord(record)};
      }
      if(message.type==='LIST_REFS'){
        const records=await repository.list(scope);
        if(!fresh(st,slot)||!(await currentDocument(doc)))return deny('stale-after-read');
        return {ok:true,type:'REFS',records:records.map(copyRecord)};
      }
      if(message.type==='UPSERT_REF'){
        // The reference URL is host-document evidence observed by Chrome,
        // not an untrusted canonical URL supplied in the message.
        const result=await repository.upsert({scope,operationId:message.operationId,
          expectedRevision:message.expectedRevision,
          ref:{conversationId:message.conversationId,nativeUrl:doc.url,projectId:null},
          beforeCommit:()=>fresh(st,slot)});
        if(!fresh(st,slot)||!(await currentDocument(doc)))return deny('stale-after-write');
        return result.ok?{...result,record:copyRecord(result.record)}:result;
      }
    }catch(e){return deny(e?.message||'repository-failure');}
    return deny('unsupported');
  }
  return Object.freeze({handle,invalidate,tabClosed,debug:()=>({
    active:[...states.values()].filter(v=>v.slot).length
  })});
}
