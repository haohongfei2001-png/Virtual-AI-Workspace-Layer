/** Self-contained for current extension-frame evaluate; imports only existing production readers.
 * The optional readers argument is for pure mock tests, never sent to the Host.
 * No seed, write grant, privileged observation, schema upgrade or store.count.
 */
export async function auditHostScaleIndex(input,readers=null){
 const {size,distribution,requireProjectMembership=false,limit=500,timeoutMs=null}=input;
 if(![1000,10000,100000].includes(size)||!['project-mixed','none-heavy','single-project'].includes(distribution)||!Number.isInteger(limit)||limit<1||limit>5000)throw Error('invalid-host-scale-audit');
 if(timeoutMs!==null&&(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000))throw Error('invalid-host-scale-audit-timeout');
 const report={status:'NOT_RUN',requestedRefs:size,distinctRefs:0,distinctProjects:0,missingRefs:size,unexpectedRefs:0,duplicateRefs:0,projectMembership:0,nativeNoneObserved:0,unknownMembership:0,wrongProjectMembership:0,wrongNoneMembership:0,pages:0,revision:null,scopeSelection:'READ_ONLY_EXISTING_ROOT_NOT_A_WRITE_GRANT'};
 let database,timer,expired=false;const transactions=new Set(),started=performance.now(),deadline=timeoutMs===null?Infinity:started+timeoutMs;
 const check=()=>{const at=performance.now();if(expired||!Number.isFinite(at)||at<started||at>=deadline)throw Error('audit-deadline');};
 const close=()=>{expired=true;for(const tx of transactions)try{tx.abort();}catch{}transactions.clear();database?.close();};
 const track=tx=>{transactions.add(tx);tx.addEventListener('complete',()=>transactions.delete(tx),{once:true});tx.addEventListener('abort',()=>transactions.delete(tx),{once:true});return tx;};
 const work=async()=>{
 try{check();
  if(!readers){
   const info=(await indexedDB.databases()).find(d=>d.name==='vaiwl-b1-v1');check();
   if(!info){report.status='NOT_RUN_INDEX_ABSENT';return report;}
   database=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name,info.version);request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('audit-refuses-schema-upgrade'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>{try{check();resolve(request.result);}catch(error){request.result.close();reject(error);}};});
   check();if(!database.objectStoreNames.contains('native_states')){report.status='NOT_RUN_INDEX_ABSENT';return report;}
   const roots=await new Promise((resolve,reject)=>{const found=[],tx=track(database.transaction('native_states','readonly')),store=tx.objectStore('native_states'),request=store.openKeyCursor();request.onsuccess=()=>{try{check();}catch(error){reject(error);try{tx.abort();}catch{}return;}const cursor=request.result;if(!cursor)return;const storedKey=cursor.key;let key;try{key=JSON.parse(storedKey);}catch{}if(Array.isArray(key)&&key.length===3&&key.every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v))){const row=store.get(storedKey);row.onsuccess=()=>{if(!expired&&row.result?.payload?.scopeKey===storedKey)found.push(key);};}cursor.continue();};tx.oncomplete=()=>resolve(found);tx.onabort=()=>reject(tx.error);});
   check();if(roots.length!==1){report.status=roots.length?'FAIL_AMBIGUOUS_SCOPE':'NOT_RUN_INDEX_ABSENT';return report;}
   const [{NativeRepository},{normalizedScope}]=await Promise.all([import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/b1/identity.mjs'))]);
   check();const [provider,accountId,organizationId]=roots[0],scope={verified:true,provider,accountId,organizationId};
   // A read selector derived from the existing root, never passed to a broker.
   // Enforce readonly even if a reader is accidentally changed in the future.
   const readonlyDB={transaction(names,mode='readonly'){if(mode!=='readonly')throw Error('audit-refuses-write-transaction');check();return track(database.transaction(names,'readonly'));}};
   const repository=new NativeRepository({baseRepository:{scopeOrThrow(value){const normalized=normalizedScope(value);if(!normalized)throw Error('invalid-existing-scope');return normalized;},open:async()=>readonlyDB}});
   readers={page:options=>repository.page(scope,options),version:()=>repository.version(scope)};
  }
  const refs=new Set(),projects=new Set();let offset=0,total=null;
  const revision=await readers.version();check();report.revision=revision;
  for(;;){
   check();const page=await readers.page({revision:report.revision,offset,limit});check();report.pages++;
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
  const finalRevision=await readers.version();check();if(finalRevision!==report.revision){report.status='UNSTABLE_REVISION';return report;}
  if(refs.size+projects.size!==total)throw Error('audit-selected-total-mismatch');
  const cardinality=refs.size===size&&report.unexpectedRefs===0&&report.duplicateRefs===0;
  const membership=report.wrongProjectMembership===0&&report.wrongNoneMembership===0&&(!requireProjectMembership||(distribution==='single-project'&&report.projectMembership===size));
  report.status=cardinality&&membership?'PASS_INDEX_AUDIT_ONLY':!cardinality?'FAIL_INDEX_CARDINALITY':'FAIL_PROJECT_MEMBERSHIP';
  report.performanceAcceptance='NOT_ESTABLISHED';return report;
 }catch(error){if(expired)throw error;report.status=error?.message==='snapshot-revision-changed'?'UNSTABLE_REVISION':'FAIL_INDEX_AUDIT';report.error=error?.message??String(error);return report;}
 finally{database?.close();}
 };
 try{
  if(timeoutMs===null)return await work();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{close();reject(Error('audit-deadline'));},timeoutMs);});
  const value=await Promise.race([work(),timeout]);check();return value;
 }catch(error){report.status='FAIL_INDEX_AUDIT';report.error=error?.message??String(error);return report;}
 finally{clearTimeout(timer);close();}
}
