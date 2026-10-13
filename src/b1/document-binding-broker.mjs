import { HUMAN_COMMANDS } from '../data/state.mjs';
import { isRecord, tokenOK, normalizedScope } from './identity.mjs';

/** Trust Chrome's sender+current frame for document identity, and a separately
 * injected PRIVILEGED account resolver for scope. URL/documentId is not login.
 * This implementation only has a synthetic fixture resolver at B1.
 */
export const VERSION=1;
const deny=reason=>({ok:false,reason});
const exact=(v,keys)=>isRecord(v)&&Object.keys(v).length===keys.length&&
  keys.every(k=>Object.hasOwn(v,k));
const viewSessionOK=s=>s===null||exact(s,['H','T','Z','policyRevision'])&&[7,14,30,60,90].includes(s.H)&&Number.isSafeInteger(s.T)&&Math.abs(s.T)<1000000&&typeof s.Z==='string'&&s.Z.length<100&&Number.isSafeInteger(s.policyRevision)&&s.policyRevision>=0;
const requestOK=m=>{
  if(!isRecord(m)||m.v!==VERSION||!tokenOK(m.clientId)||
     !Number.isSafeInteger(m.seq)||m.seq<1)return false;
  const base=['v','type','clientId','seq'];
  switch(m.type){
    case 'BIND':return exact(m,base);
    case 'CHECK':case 'LIST_REFS':return exact(m,[...base,'leaseId'])&&tokenOK(m.leaseId);
    case 'GET_REF':return exact(m,[...base,'leaseId','conversationId'])&&
      tokenOK(m.leaseId)&&tokenOK(m.conversationId);
    case 'B23_SNAPSHOT':return exact(m,[...base,'leaseId','now','timeZone','size'])&&tokenOK(m.leaseId)&&typeof m.now==='string'&&typeof m.timeZone==='string'&&m.timeZone.length<100&&Number.isInteger(m.size)&&m.size>=1&&m.size<=120;
    case 'B23_PARTITION_HEADER':return exact(m,[...base,'leaseId','now','timeZone','size'])&&tokenOK(m.leaseId)&&typeof m.now==='string'&&typeof m.timeZone==='string'&&m.timeZone.length<100&&Number.isInteger(m.size)&&m.size>=1&&m.size<=120;
    case 'B23_PARTITION_PAGE':return exact(m,[...base,'leaseId','revision','offset','ids'])&&tokenOK(m.leaseId)&&Number.isSafeInteger(m.revision)&&m.revision>=0&&Number.isSafeInteger(m.offset)&&m.offset>=0&&m.offset<=100000&&(m.ids===null||Array.isArray(m.ids)&&m.ids.length<=5000&&m.ids.every(tokenOK));
    case 'B23_COMMAND':return exact(m,[...base,'leaseId','operationId','expectedRevision','command'])&&tokenOK(m.leaseId)&&tokenOK(m.operationId)&&Number.isSafeInteger(m.expectedRevision)&&m.expectedRevision>=0&&isRecord(m.command)&&HUMAN_COMMANDS.includes(m.command.type)&&JSON.stringify(m.command).length<(m.command.type==='SET_PREFERENCE'?512000:10000);
    case 'B23_FREE_CALIBRATE':return exact(m,[...base,'leaseId','kind','objectIds'])&&tokenOK(m.leaseId)&&['foreground','history','current'].includes(m.kind)&&Array.isArray(m.objectIds)&&m.objectIds.length>0&&m.objectIds.length<=64&&m.objectIds.every(tokenOK);
    case 'B23_SYNTHETIC_SEND':return exact(m,[...base,'leaseId','conversationId','messageId','projectId','nativeTitle'])&&tokenOK(m.leaseId)&&tokenOK(m.conversationId)&&tokenOK(m.messageId)&&(m.projectId===null||tokenOK(m.projectId))&&typeof m.nativeTitle==='string'&&m.nativeTitle.trim().length>0&&m.nativeTitle.length<=200;
    case 'B23_UNDO':return exact(m,[...base,'leaseId','operationId','expectedRevision','targetOperationId'])&&tokenOK(m.leaseId)&&tokenOK(m.operationId)&&tokenOK(m.targetOperationId)&&Number.isSafeInteger(m.expectedRevision)&&m.expectedRevision>=0;
    case 'B23_FREE_HEADER':case 'B23_FREE_SNAPSHOT':return tokenOK(m.leaseId)&&(exact(m,[...base,'leaseId'])||(exact(m,[...base,'leaseId','now','timeZone','size'])||exact(m,[...base,'leaseId','now','timeZone','size','viewSession'])&&viewSessionOK(m.viewSession))&&typeof m.now==='string'&&typeof m.timeZone==='string'&&m.timeZone.length<100&&Number.isInteger(m.size)&&m.size>=1&&m.size<=120);
    case 'B23_FREE_PAGE':return exact(m,[...base,'leaseId','revision','offset','limit','ids','viewSession','now'])&&tokenOK(m.leaseId)&&Number.isSafeInteger(m.revision)&&m.revision>=0&&Number.isSafeInteger(m.offset)&&m.offset>=0&&Number.isInteger(m.limit)&&m.limit>0&&m.limit<=5000&&viewSessionOK(m.viewSession)&&m.viewSession!==null&&typeof m.now==='string'&&(m.ids===null||exact(m.ids,['projects','refs'])&&Array.isArray(m.ids.projects)&&Array.isArray(m.ids.refs)&&m.ids.projects.length+m.ids.refs.length<=5000&&[...m.ids.projects,...m.ids.refs].every(tokenOK));
    case 'B23_FREE_RECOVERY_STATUS':case 'B23_EXPORT_BACKUP':case 'B23_STORAGE':case 'B23_RECOVERY_STATUS':return exact(m,[...base,'leaseId'])&&tokenOK(m.leaseId);
    case 'B23_PREVIEW_RESTORE':return exact(m,[...base,'leaseId','bundle'])&&tokenOK(m.leaseId)&&isRecord(m.bundle)&&JSON.stringify(m.bundle).length<18000000;
    case 'B23_RESTORE_BACKUP':return exact(m,[...base,'leaseId','operationId','expectedRevision','bundle','planHash'])&&tokenOK(m.leaseId)&&tokenOK(m.operationId)&&Number.isSafeInteger(m.expectedRevision)&&m.expectedRevision>=0&&isRecord(m.bundle)&&JSON.stringify(m.bundle).length<18000000&&typeof m.planHash==='string'&&m.planHash.length===64;
    case 'B23_FREE_RECOVER':return exact(m,[...base,'leaseId','kind','operationId','damagedHash'])&&tokenOK(m.leaseId)&&['native','evidence'].includes(m.kind)&&tokenOK(m.operationId)&&typeof m.damagedHash==='string'&&/^[0-9a-f]{64}$/.test(m.damagedHash);
    case 'B23_RECOVER_ASSETS':return exact(m,[...base,'leaseId','operationId','damagedHash'])&&tokenOK(m.leaseId)&&tokenOK(m.operationId)&&typeof m.damagedHash==='string'&&m.damagedHash.length===64;
    case 'B23_HISTORY':return exact(m,[...base,'leaseId'])&&tokenOK(m.leaseId);
    case 'B23_SAVE_VIEW':return exact(m,[...base,'leaseId','value','expectedRevision'])&&tokenOK(m.leaseId)&&isRecord(m.value)&&Number.isSafeInteger(m.expectedRevision)&&m.expectedRevision>=0&&JSON.stringify(m.value).length<1000000;
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
 makeId=()=>crypto.randomUUID(),leaseMs=20000,maxTabs=128,allowedURL=fixtureURL,workspaceRepository=null,freeRuntime=null
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
    s.slot?.abort?.abort();s.epoch++;s.slot=null;return true;
  }
  function tabClosed(tabId){states.get(tabId+':0')?.slot?.abort?.abort();states.delete(tabId+':0');}
  async function currentDocument(doc){
    try{
      const f=await getFrame({tabId:doc.tabId,frameId:doc.frameId});
      if(!isRecord(f)||!tokenOK(f.documentId)||!allowedURL(f.url)||
        f.errorOccurred===true||(f.documentLifecycle&&f.documentLifecycle!=='active'))return null;
      const actual={tabId:doc.tabId,frameId:doc.frameId,documentId:f.documentId,url:f.url};
      // Chrome MessageSender.url can remain the document's initial URL after
      // history.pushState. The browser's current frame URL is authoritative
      // for route/scope; sender's documentId + exact origin must still match.
      if(actual.documentId!==doc.documentId||
         new URL(actual.url).origin!==new URL(doc.url).origin)return null;
      return actual;
    }catch{return null;}
  }
  async function scopeFor(doc,sender){
    try{
      const scope=normalizedScope(await resolveScope({document:doc,currentFrame:doc,sender}));
      return scope;
    }catch{return null;}
  }
  const fresh=(st,slot)=>st.slot===slot&&st.epoch===slot.epoch&&now()<slot.expiresAt;
  // Recheck scope after asynchronous repository work, even when the URL has
  // not changed. This is a response fence, not a transactional account oracle.
  async function currentAuthority(st,slot,doc,sender){
    if(!fresh(st,slot)||!sameDoc(await currentDocument(doc),doc)){if(st.slot===slot){slot.abort.abort();st.slot=null;st.epoch++;}return false;}
    const currentScope=await scopeFor(doc,sender);
    const finalDocument=await currentDocument(doc);
    // The final frame lookup also yields. Revocation during that await must win.
    const valid=fresh(st,slot)&&!slot.abort.signal.aborted&&currentScope?.key===slot.scope.key&&sameDoc(finalDocument,doc);
    if(!valid&&st.slot===slot){slot.abort.abort();st.slot=null;st.epoch++;}
    return valid;
  }
  const copyRecord=r=>r?{conversationId:r.conversationId,nativeUrl:r.nativeUrl,
    projectId:r.projectId,revision:r.revision}:null;
  async function handle(message,sender){
    if(!requestOK(message))return deny('invalid-request');
    const senderDoc=isSender(sender,extensionId,allowedURL);
    if(!senderDoc)return deny('invalid-sender');
    const key=tabKey(senderDoc),st=stateFor(key),startEpoch=st.epoch;
    const doc=await currentDocument(senderDoc);
    if(!doc){if(st.slot?.doc.documentId===senderDoc.documentId)invalidate(senderDoc);return deny('not-current-document');}
    if(st.epoch!==startEpoch)return deny('invalidated-during-check');
    // Resolve authority only from the current browser-confirmed frame, never
    // from a client-supplied account or possibly stale sender.url.
    const scope=await scopeFor(doc,sender);
    if(!scope){invalidate(doc);return deny('unverified-scope');}
    if(st.epoch!==startEpoch||!sameDoc(await currentDocument(senderDoc),doc))return deny('stale-document');
    if(st.epoch!==startEpoch)return deny('invalidated-during-check');
    if(st.slot&&(!sameDoc(st.slot.doc,doc)||st.slot.scope.key!==scope.key)){st.slot.abort.abort();st.slot=null;st.epoch++;}
    if(message.type==='BIND'){
      if(st.slot&&sameDoc(st.slot.doc,doc)&&st.slot.clientId===message.clientId&&
         message.seq<=st.slot.seq)return deny('replayed-sequence');
      if(!st.slot&&[...states.values()].filter(v=>v.slot).length>=maxTabs)
        return deny('capacity');
      const leaseId=makeId();
      if(!tokenOK(leaseId))return deny('bad-lease');
      st.slot?.abort?.abort();st.epoch++;
      const slot={doc,scope,sender,clientId:message.clientId,seq:message.seq,
        leaseId,expiresAt:now()+leaseMs,epoch:st.epoch,abort:new AbortController()};
      st.slot=slot;
      try {freeRuntime?.bind({bindingId:leaseId,scope,guard:()=>fresh(st,slot),signal:slot.abort.signal,authorityCheck:()=>currentAuthority(st,slot,doc,sender)});} catch {slot.abort.abort();st.slot=null;return deny('free-runtime-bind-failed');}
      return {ok:true,type:'BOUND',v:VERSION,leaseId,expiresAt:slot.expiresAt,
        documentId:doc.documentId,scope:scope.key,clientId:message.clientId,seq:message.seq};
    }
    const slot=st.slot;
    if(!slot||!fresh(st,slot)||!sameDoc(slot.doc,doc)||
       slot.leaseId!==message.leaseId||slot.clientId!==message.clientId||
       slot.scope.key!==scope.key||message.seq<=slot.seq)return deny('stale-binding');
    // Every request observes a strictly increasing sequence.
    slot.seq=message.seq;
    const priority=['CHECK','B23_FREE_HEADER','B23_FREE_PAGE','B23_SYNTHETIC_SEND','UPSERT_REF'].includes(message.type);
    const releaseForeground=priority?(freeRuntime?.beginForeground?freeRuntime.beginForeground(slot.leaseId):freeRuntime?.prioritizeForeground?.(slot.leaseId)):null;
    try{
    if(message.type==='CHECK'){
      try{const version=workspaceRepository?.version?await workspaceRepository.version(scope,{guard:()=>fresh(st,slot),signal:slot.abort.signal}):{};
        if(!(await currentAuthority(st,slot,doc,sender)))return deny('stale-after-workspace');
        return {ok:true,type:'CURRENT',v:VERSION,seq:message.seq,...version,scope:scope.key};
      }catch(e){return deny(e?.message??'version-read-failed');}
    }
    try{
      if(message.type.startsWith('B23_')){
        if(!workspaceRepository)return deny('workspace-unavailable');
        const options={guard:()=>fresh(st,slot),signal:slot.abort.signal};let result;
        if(message.type==='B23_SNAPSHOT'){const value=workspaceRepository.partitionHeader?await workspaceRepository.partitionHeader(scope,options):null;result=value?{ok:true,partition:value}:{ok:true,snapshot:await workspaceRepository.snapshot(scope,message.now,message.timeZone,options,message.size)};}
        else if(message.type==='B23_FREE_RECOVERY_STATUS')result=workspaceRepository.freeRecoveryStatus?{ok:true,recovery:await workspaceRepository.freeRecoveryStatus(scope,options)}:deny('free-recovery-unavailable');
        else if(message.type==='B23_FREE_RECOVER')result=workspaceRepository.freeRecover?await workspaceRepository.freeRecover(scope,{kind:message.kind,operationId:message.operationId,damagedHash:message.damagedHash},options):deny('free-recovery-unavailable');
        else if(message.type==='B23_FREE_CALIBRATE'){
          if(!freeRuntime)result=deny('free-runtime-unavailable');
          else{
            const time=now();slot.calibrationTriggers??=new Map();const previous=slot.calibrationTriggers.get(message.kind);
            const ids=[...new Set(message.objectIds)],freshIds=previous&&time-previous.time<1000?ids.filter(id=>!previous.ids.includes(id)):ids;
            if(!freshIds.length)result={ok:true,status:'coalesced'};
            else{slot.calibrationTriggers.set(message.kind,{time,ids});freeRuntime.notify(slot.leaseId,message.kind,{objectIds:freshIds}).catch(()=>{});result={ok:true,status:'scheduled'};}
          }
        }
        else if(message.type==='B23_FREE_HEADER'){
          if(freeRuntime){const foreground=await freeRuntime.foreground(slot.leaseId,{session:message.viewSession??null,readCached:false});foreground.calibration.catch(()=>{});}
          result=workspaceRepository.freeHeader?{ok:true,header:await workspaceRepository.freeHeader(scope,options,message.now,message.timeZone,message.viewSession,doc.url)}:deny('free-header-unavailable');}
        else if(message.type==='B23_FREE_PAGE')result=workspaceRepository.freePage?{ok:true,page:await workspaceRepository.freePage(scope,{revision:message.revision,offset:message.offset,limit:message.limit,ids:message.ids,viewSession:message.viewSession,now:message.now},options)}:deny('free-page-unavailable');
        else if(message.type==='B23_FREE_SNAPSHOT')result=workspaceRepository.freeSnapshot?{ok:true,snapshot:await workspaceRepository.freeSnapshot(scope,options,message.now,message.timeZone,message.viewSession)}:deny('free-snapshot-unavailable');
        else if(message.type==='B23_PARTITION_HEADER'){const value=await workspaceRepository.partitionHeader(scope,options);result=value?{ok:true,partition:value}:{ok:true,snapshot:await workspaceRepository.snapshot(scope,message.now,message.timeZone,options,message.size)};}
        else if(message.type==='B23_PARTITION_PAGE')result={ok:true,page:await workspaceRepository.partitionPage(scope,{revision:message.revision,offset:message.offset,ids:message.ids},options)};
        else if(message.type==='B23_COMMAND')result=await workspaceRepository.command(scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,command:message.command},options);
        else if(message.type==='B23_SYNTHETIC_SEND'){result=workspaceRepository.fixtureObserve?await workspaceRepository.fixtureObserve(scope,message,options,doc.url):deny('synthetic-source-unavailable');if(result.ok&&freeRuntime)freeRuntime.notify(slot.leaseId,'send',{objectIds:[message.conversationId]}).catch(()=>{});}
        else if(message.type==='B23_UNDO')result=await workspaceRepository.undo(scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,targetOperationId:message.targetOperationId},options);
        else if(message.type==='B23_EXPORT_BACKUP')result={ok:true,bundle:await workspaceRepository.exportBackup(scope,options)};
        else if(message.type==='B23_PREVIEW_RESTORE')result={ok:true,preview:await workspaceRepository.previewRestore(scope,message.bundle,options)};
        else if(message.type==='B23_RESTORE_BACKUP')result=await workspaceRepository.restoreBackup(scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,bundle:message.bundle,planHash:message.planHash},options);
        else if(message.type==='B23_STORAGE')result={ok:true,storage:await workspaceRepository.storage()};
        else if(message.type==='B23_RECOVERY_STATUS')result={ok:true,recovery:await workspaceRepository.recoveryStatus(scope,options)};
        else if(message.type==='B23_RECOVER_ASSETS')result=await workspaceRepository.recover(scope,{operationId:message.operationId,damagedHash:message.damagedHash},options);
        else if(message.type==='B23_HISTORY')result={ok:true,history:await workspaceRepository.history(scope)};
        else if(message.type==='B23_SAVE_VIEW')result=await workspaceRepository.saveView(scope,message.value,message.expectedRevision,options);
        else return deny('unsupported');
        if(!(await currentAuthority(st,slot,doc,sender)))return deny('stale-after-workspace');
        // Deadlines come from owner repository pages, never from a page payload.
        const payload=result.header??result.page;if(payload?.calibrationDeadlines){freeRuntime?.observeDeadlines?.(slot.leaseId,payload.calibrationDeadlines);delete payload.calibrationDeadlines;}
        // Bound the final projected IPC page, including UTF-8 expansion and envelope.
        if(message.type==='B23_FREE_PAGE'&&result.ok&&new TextEncoder().encode(JSON.stringify(result)).length>16*1024*1024)return deny('free-page-too-large');
        return result;
      }
      if(message.type==='GET_REF'){
        const record=await repository.get(scope,message.conversationId);
        if(!(await currentAuthority(st,slot,doc,sender)))return deny('stale-after-read');
        return {ok:true,type:'REF',record:copyRecord(record)};
      }
      if(message.type==='LIST_REFS'){
        const records=await repository.list(scope);
        if(!(await currentAuthority(st,slot,doc,sender)))return deny('stale-after-read');
        return {ok:true,type:'REFS',records:records.map(copyRecord)};
      }
      if(message.type==='UPSERT_REF'){
        // The reference URL is host-document evidence observed by Chrome,
        // not an untrusted canonical URL supplied in the message.
        const result=await repository.upsert({scope,operationId:message.operationId,
          expectedRevision:message.expectedRevision,
          ref:{conversationId:message.conversationId,nativeUrl:doc.url,projectId:null},
          beforeCommit:()=>fresh(st,slot)});
        if(!(await currentAuthority(st,slot,doc,sender)))return deny('stale-after-write');
        if(result.ok)freeRuntime?.reconcileReferences?.(slot.leaseId,{restart:true}).catch(()=>{});
        return result.ok?{...result,record:copyRecord(result.record)}:result;
      }
    }catch(e){return deny(e?.message||'repository-failure');}
    return deny('unsupported');
    }finally{if(typeof releaseForeground==='function')releaseForeground();}
  }
  async function notificationTarget(leaseId){
    for(const st of states.values()){
      const slot=st.slot;if(slot?.leaseId!==leaseId)continue;
      if(await currentAuthority(st,slot,slot.doc,slot.sender))return {tabId:slot.doc.tabId,documentId:slot.doc.documentId};
    }
    return null;
  }
  return Object.freeze({handle,invalidate,tabClosed,notificationTarget,debug:()=>({
    active:[...states.values()].filter(v=>v.slot).length
  })});
}
