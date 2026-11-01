/** First-project-only mixed-world oracle. All 1000 distinct IDs checked at one revision.
 * Self-contained for current extension-frame evaluate; imports only existing production readers.
 * The optional readers argument is for pure mock tests, never sent to the Host.
 * No seed, write grant, privileged observation, schema upgrade or store.count.
 */
export async function auditMixedMemberIndex(input,readers=null){
 const {size=1000,distribution="project-mixed",limit=500}=input;
 const requireProjectMembership=false;
 if(size!==1000||distribution!=='project-mixed'||!Number.isInteger(limit)||limit<1||limit>5000)throw Error('invalid-host-scale-audit');
 const report={status:'NOT_RUN',requestedRefs:size,distinctRefs:0,distinctProjects:0,missingRefs:size,unexpectedRefs:0,duplicateRefs:0,projectMembership:0,nativeNoneObserved:0,unknownMembership:0,wrongProjectMembership:0,wrongNoneMembership:0,firstProjectMembers:0,unseenProjectUnknown:0,otherUnknown:0,unexpectedKnowledge:0,pages:0,revision:null,scopeSelection:'READ_ONLY_EXISTING_ROOT_NOT_A_WRITE_GRANT'};
 let database;
 try{
  if(!readers){
   const info=(await indexedDB.databases()).find(d=>d.name==='vaiwl-b1-v1');
   if(!info){report.status='NOT_RUN_INDEX_ABSENT';return report;}
   database=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name,info.version);request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('audit-refuses-schema-upgrade'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
   if(!database.objectStoreNames.contains('native_states')){report.status='NOT_RUN_INDEX_ABSENT';return report;}
   const roots=await new Promise((resolve,reject)=>{const found=[],tx=database.transaction('native_states','readonly'),store=tx.objectStore('native_states'),request=store.openKeyCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const storedKey=cursor.key;let key;try{key=JSON.parse(storedKey);}catch{}if(Array.isArray(key)&&key.length===3&&key.every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v))){const row=store.get(storedKey);row.onsuccess=()=>{if(row.result?.payload?.scopeKey===storedKey)found.push(key);};}cursor.continue();};tx.oncomplete=()=>resolve(found);tx.onabort=()=>reject(tx.error);});
   if(roots.length!==1){report.status=roots.length?'FAIL_AMBIGUOUS_SCOPE':'NOT_RUN_INDEX_ABSENT';return report;}
   const [{NativeRepository},{normalizedScope}]=await Promise.all([import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/b1/identity.mjs'))]);
   const [provider,accountId,organizationId]=roots[0],scope={verified:true,provider,accountId,organizationId};
   // A read selector derived from the existing root, never passed to a broker.
   // Enforce readonly even if a reader is accidentally changed in the future.
   const readonlyDB={transaction(names,mode='readonly'){if(mode!=='readonly')throw Error('audit-refuses-write-transaction');return database.transaction(names,'readonly');}};
   const repository=new NativeRepository({baseRepository:{scopeOrThrow(value){const normalized=normalizedScope(value);if(!normalized)throw Error('invalid-existing-scope');return normalized;},open:async()=>readonlyDB}});
   readers={page:options=>repository.page(scope,options),version:()=>repository.version(scope)};
  }
  const refs=new Set(),projects=new Set();let offset=0,total=null;
  report.revision=await readers.version();
  for(;;){
   const page=await readers.page({revision:report.revision,offset,limit});report.pages++;
   if(page.revision!==report.revision){report.status='UNSTABLE_REVISION';return report;}
   if(!Number.isSafeInteger(page.total)||page.total<0||page.offset!==offset||!Array.isArray(page.selectedRefs)||!Array.isArray(page.selectedProjects)||page.selectedRefs.length+page.selectedProjects.length>limit||!page.facts?.refs||!page.facts?.projects)throw Error('invalid-audit-page');
   if(total===null)total=page.total;else if(total!==page.total)throw Error('audit-total-changed-without-revision');
   for(const id of page.selectedProjects){if(projects.has(id)||!page.facts.projects[id])throw Error('invalid-audit-project-page');projects.add(id);}
   for(const id of page.selectedRefs){
    if(!page.facts.refs[id])throw Error('audit-ref-missing-from-page');
    if(refs.has(id)){report.duplicateRefs++;continue;}refs.add(id);
    const match=/^60000000-0000-4000-8000-([0-9a-f]{12})$/.exec(id),index=match?Number.parseInt(match[1],16):-1;
    if(index<0||index>=size)report.unexpectedRefs++;
    const membership=page.facts.membership?.[id];
    const expectedFirst=index>=0&&index<100&&index%5!==4;
    if(expectedFirst&&membership?.state==='PROJECT'&&membership.projectId==='g-p-00000000000000000000000000000001')report.firstProjectMembers++;
    else if(!expectedFirst&&(!membership||membership.state==='UNKNOWN')){if(index>=100&&index%5!==4)report.unseenProjectUnknown++;else report.otherUnknown++;}
    else if(!expectedFirst)report.unexpectedKnowledge++;
    if(membership?.state==='PROJECT'){
     report.projectMembership++;const grouped=distribution==='single-project'||(distribution==='project-mixed'?index%5!==4:index%10===0),projectIndex=distribution==='single-project'?0:Math.floor(index/100),expectedProject='g-p-'+(projectIndex+1).toString(16).padStart(32,'0');
     if(!grouped||membership.projectId!==expectedProject)report.wrongProjectMembership++;
    }else if(membership?.state==='NONE'){report.nativeNoneObserved++;if(distribution==='single-project'||(distribution==='project-mixed'?index%5!==4:index%10===0))report.wrongNoneMembership++;}
    else report.unknownMembership++;
   }
   report.distinctRefs=refs.size;report.distinctProjects=projects.size;report.missingRefs=Math.max(0,size-(refs.size-report.unexpectedRefs));
   if(page.nextOffset===total)break;
   if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset||page.nextOffset>total)throw Error('invalid-audit-next-offset');
   offset=page.nextOffset;
  }
  if(await readers.version()!==report.revision){report.status='UNSTABLE_REVISION';return report;}
  if(refs.size+projects.size!==total)throw Error('audit-selected-total-mismatch');
  const cardinality=refs.size===size&&report.unexpectedRefs===0&&report.duplicateRefs===0;
  const membership=report.wrongProjectMembership===0&&report.wrongNoneMembership===0&&(!requireProjectMembership||(distribution==='single-project'&&report.projectMembership===size));
  report.status=cardinality&&membership&&report.firstProjectMembers===80&&report.unseenProjectUnknown===720&&report.otherUnknown===200&&report.unexpectedKnowledge===0&&report.nativeNoneObserved===0?'PASS_PARTIAL_MIXED_MAPPING':!cardinality?'PENDING_INDEX_CARDINALITY':'PENDING_OR_WRONG_MIXED_MAPPING';
  report.performanceAcceptance='NOT_ESTABLISHED';return report;
 }catch(error){report.status=error?.message==='snapshot-revision-changed'?'UNSTABLE_REVISION':'FAIL_INDEX_AUDIT';report.error=error?.message??String(error);return report;}
 finally{database?.close();}
}
