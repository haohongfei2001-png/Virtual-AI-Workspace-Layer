import {auditHostScaleIndex} from './host-scale-audit.mjs';
/** Test-only exact-tail progress, never full membership or performance proof.
 * This function is self-contained for an existing exact extension frame.
 * Optional readers are pure test doubles and are never sent to the Host.
 */
export async function readHostScaleMemberProgress({id,projectId,scopeSelector=null},readers=null){
 if(typeof id!=='string'||!/^60000000-0000-4000-8000-[0-9a-f]{12}$/.test(id)||typeof projectId!=='string'||!/^g-p-[0-9a-f]{32}$/.test(projectId)||scopeSelector!==null&&(!Array.isArray(scopeSelector)||scopeSelector.length!==3||scopeSelector.some(v=>typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))))throw Error('invalid-member-progress-input');
 let database;
 try{
  if(!readers){
   const info=(await indexedDB.databases()).find(d=>d.name==='vaiwl-b1-v1');
   if(!info)return {status:'PENDING_INDEX',scopeSelector};
   database=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name,info.version);request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('member-progress-refuses-schema-upgrade'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
   if(!database.objectStoreNames.contains('native_states')||!database.objectStoreNames.contains('native_operations'))return {status:'PENDING_INDEX',scopeSelector};
   if(scopeSelector===null){
    const roots=await new Promise((resolve,reject)=>{const found=[],tx=database.transaction('native_states','readonly'),store=tx.objectStore('native_states'),request=store.openKeyCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const storedKey=cursor.key;let key;try{key=JSON.parse(storedKey);}catch{}if(Array.isArray(key)&&key.length===3&&key.every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v))){const row=store.get(storedKey);row.onsuccess=()=>{if(row.result?.payload?.scopeKey===storedKey)found.push(key);};}cursor.continue();};tx.oncomplete=()=>resolve(found);tx.onabort=()=>reject(tx.error);});
    if(roots.length>1)throw Error('member-progress-ambiguous-existing-scope');
    if(!roots.length)return {status:'PENDING_INDEX',scopeSelector:null};scopeSelector=roots[0];
   }
   const [{NativeRepository},{normalizedScope}]=await Promise.all([import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/b1/identity.mjs'))]);
   const [provider,accountId,organizationId]=scopeSelector,scope={verified:true,provider,accountId,organizationId};
   const readonlyDB={transaction(names,mode='readonly'){if(mode!=='readonly')throw Error('member-progress-refuses-write-transaction');return database.transaction(names,'readonly');}};
   const repository=new NativeRepository({baseRepository:{scopeOrThrow(value){const normalized=normalizedScope(value);if(!normalized)throw Error('invalid-existing-scope');return normalized;},open:async()=>readonlyDB}});
   readers={page:options=>repository.page(scope,options)};
  }
  const page=await readers.page({ids:{projects:[],refs:[id]},limit:1});
  if(!Number.isSafeInteger(page?.revision)||page.revision<0||!Array.isArray(page.selectedRefs)||page.selectedRefs.length!==1||page.selectedRefs[0]!==id||!Array.isArray(page.selectedProjects)||page.selectedProjects.length!==0||!page.facts?.refs||!page.facts?.membership||!page.facts?.projects)throw Error('invalid-member-progress-page');
  const ref=page.facts.refs[id],membership=page.facts.membership[id];
  if(!ref||!membership||membership.state==='UNKNOWN')return {status:'PENDING_MEMBER',revision:page.revision,scopeSelector};
  if(ref.id!==id||membership.id!==id||membership.state!=='PROJECT'||membership.projectId!==projectId||page.facts.projects[projectId]?.id!==projectId)throw Error('member-progress-wrong-membership');
  return {status:'OBSERVED_TAIL_ONLY',revision:page.revision,scopeSelector,total:page.total};
 }finally{database?.close();}
}

/** Native evidence must remain genuinely visible while the finite pass proceeds. */
export function hostScaleMemberReadingVisible({url,projectId}){
 if(location.href!==url)return false;
 const roots=document.querySelectorAll('main > #reading'),members=document.querySelectorAll('main #reading nav[aria-label="Project conversations"]');
 if(roots.length!==1||members.length!==1||!roots[0].contains(members[0])||members[0].getAttribute('data-project-id')!==projectId||document.querySelector('[data-va-owned][id$="_workspace"]:popover-open'))return false;
 for(const node of [roots[0],members[0]]){
  if(!node.isConnected||!node.getClientRects().length)return false;
  for(let parent=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(parent.hidden||parent.inert||parent.getAttribute('aria-hidden')==='true'||style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;}
 }
 return true;
}

/** One caller-owned deadline covers this prerequisite and the later return.
 * Replaced readonly frames may be observed anew; no UI action is retried here.
 */
export async function waitHostScaleMemberProgress({page,extensionId,url,projectId,id,size=null,distribution=null,deadline,now=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(size!==null&&(![1000,10000,100000].includes(size)||distribution!=='single-project'))throw Error('invalid-member-complete-audit');
 if(!Number.isFinite(deadline)||deadline<=now())throw Error('host-scale-member-deadline');
 const frameURL=`chrome-extension://${extensionId}/workspace.html`,current=()=>{const frames=page.frames().filter(frame=>frame.url()===frameURL&&!frame.isDetached());if(frames.length>1)throw Error('member-progress-ambiguous-frame');return frames[0]??null;};
 let scopeSelector=null,scopeFrame=null,attempts=0,stableRevision=null;
 const remaining=()=>{const value=deadline-now();if(!(value>0))throw Error('host-scale-member-deadline');return value;};
 const bounded=async operation=>{const duration=remaining();let timer;try{return await Promise.race([Promise.resolve().then(()=>{remaining();return operation();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('host-scale-member-deadline')),duration);})]);}finally{clearTimeout(timer);}};
 const native=async()=>{if(page.isClosed())throw Error('native-parent-closed');const visible=await bounded(()=>page.evaluate(hostScaleMemberReadingVisible,{url,projectId}));if(page.isClosed())throw Error('native-parent-closed');if(!visible)throw Error('member-progress-native-reading-not-visible');remaining();};
 while(now()<deadline){
  await native();const frame=current();
  if(frame!==scopeFrame){scopeSelector=null;scopeFrame=frame;stableRevision=null;}
  if(frame){
   let result;
   try{const ready=await bounded(()=>frame.evaluate(()=>document.readyState!=='loading'));if(ready&&current()===frame&&!frame.isDetached())result=await bounded(()=>frame.evaluate(readHostScaleMemberProgress,{id,projectId,scopeSelector}));}
   catch(error){if(page.isClosed()||!frame.isDetached()&&current()===frame||error.message==='host-scale-member-deadline')throw error;}
   remaining();await native();
   if(result&&!frame.isDetached()&&current()===frame){
    attempts++;scopeSelector=result.scopeSelector??scopeSelector;
    // The exact-ID read already returns admitted cardinality. A smaller total
    // cannot pass the full audit; avoid repeatedly enumerating growing IDB
    // inventories during ingestion. Missing totals keep the original audit.
    // Counts never prove membership: both final full audits remain mandatory.
    const incompleteTotal=size!==null&&Number.isSafeInteger(result.total)&&result.total>=0&&result.total<size+1;
    if(incompleteTotal)stableRevision=null;
    if(result.status==='OBSERVED_TAIL_ONLY'&&!incompleteTotal){
     if(size===null)return {status:result.status,revision:result.revision,attempts,remainingMs:remaining(),acceptance:'NOT_ESTABLISHED'};
     // Priority tails arrive before the middle of the native list. Keep reading
     // visible until independently enumerated facts pass twice at one revision.
     let audit;
     try{audit=await bounded(()=>frame.evaluate(auditHostScaleIndex,{size,distribution,requireProjectMembership:true,limit:500,timeoutMs:Math.min(30000,remaining())}));}
     catch(error){if(page.isClosed()||!frame.isDetached()&&current()===frame||error.message==='host-scale-member-deadline')throw error;stableRevision=null;continue;}
     remaining();await native();
     if(frame.isDetached()||current()!==frame){stableRevision=null;continue;}
     if(audit.status==='PASS_INDEX_AUDIT_ONLY'){
      if(!Number.isSafeInteger(audit.revision)||audit.revision<0)throw Error('invalid-member-audit-revision');
      if(stableRevision===audit.revision)return {status:'OBSERVED_COMPLETE_INDEX',revision:audit.revision,audit,stableSamples:2,attempts,remainingMs:remaining(),acceptance:'NOT_ESTABLISHED'};
      stableRevision=audit.revision;
     }else{
      stableRevision=null;
      if(!['NOT_RUN_INDEX_ABSENT','UNSTABLE_REVISION','FAIL_INDEX_CARDINALITY','FAIL_PROJECT_MEMBERSHIP'].includes(audit.status))throw Error('member-progress-index-audit-failed:'+audit.status);
     }
    }
    if(result.status!=='OBSERVED_TAIL_ONLY')stableRevision=null;
    if(!['PENDING_INDEX','PENDING_MEMBER','OBSERVED_TAIL_ONLY'].includes(result.status))throw Error('invalid-member-progress-result');
   }
  }
  await pause(Math.min(100,remaining()));
 }
 throw Error('host-scale-member-deadline');
}
