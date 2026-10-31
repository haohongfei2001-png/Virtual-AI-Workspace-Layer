/** Instrumented COPY only. Never package this recorder into the formal build. */
export const J4_REENABLE_TRACE_KIND='DIAGNOSTIC_ONLY_J4_REENABLE_OWNER_TRACE';
const recorder=`const __j4OwnerState=globalThis.__vaiwlJ4ReenableOwner??={rows:[],dropped:0,labelsExhausted:false};
const __j4OwnerLabels=new Map();
const __j4Anon=value=>{if(typeof value!=='string')return null;if(__j4OwnerLabels.has(value))return __j4OwnerLabels.get(value);if(__j4OwnerLabels.size>=256){__j4OwnerState.labelsExhausted=true;return null;}const n=__j4OwnerLabels.size+1;__j4OwnerLabels.set(value,n);return n;};
const __j4Owner=(stage,fields={})=>{try{if(__j4OwnerState.rows.length>=512){__j4OwnerState.dropped++;return;}__j4OwnerState.rows.push({stage,sequence:__j4OwnerState.rows.length+1,at:Date.now(),...fields});}catch{__j4OwnerState.dropped++;}};\n`;
export function instrumentJ4ReenableOwner(path,source){
 if(source.includes('__j4Owner'))throw Error('j4-owner-already-instrumented');let out=source;
 const inject=(from,to)=>{if(out.split(from).length!==2)throw Error('j4-owner-anchor-mismatch');out=out.replace(from,to);};
 if(path==='src/runtime/browser-request-context.mjs'){
  inject('function send(details){','function send(details){__j4Owner("send",{document:__j4Anon(details?.documentId),request:__j4Anon(details?.requestId)});');
  inject('requests.set(request.requestId,request);','requests.set(request.requestId,request);__j4Owner("queued",{document:__j4Anon(request.documentId),request:__j4Anon(request.requestId)});');
  inject('function complete(details){','function complete(details){__j4Owner("complete",{document:__j4Anon(details?.documentId),request:__j4Anon(details?.requestId),tracked:requests.has(details?.requestId)});');
  inject('r.document.receipt=receipt;','r.document.receipt=receipt;__j4Owner("receipt-installed",{document:__j4Anon(r.documentId),request:__j4Anon(r.requestId)});');
  inject('function drop(document,reason){document.receipt=null;','function drop(document,reason){__j4Owner("drop",{document:__j4Anon(document.documentId),receiptPresent:!!document.receipt,reason:["navigation","context-selection-pending","concurrent-context-conflict","request-failed","request-expired","context-expired"].includes(reason)?reason:"OTHER"});document.receipt=null;');
  inject('function invalidateCommitted(details){','function invalidateCommitted(details){__j4Owner("committed",{document:__j4Anon(details?.documentId),sameDocument:[...documents.values()].some(d=>d.tabId===details?.tabId&&d.documentId===details?.documentId),sameDocumentReceipt:[...documents.values()].some(d=>d.tabId===details?.tabId&&d.documentId===details?.documentId&&!!d.receipt)});');
  inject("const receipt=documents.get(key(frame))?.receipt;if(signal?.aborted||!isCurrent(frame,receipt)){diagnostic('association-no-current-receipt');return null;}",'const receipt=documents.get(key(frame))?.receipt;if(signal?.aborted||!isCurrent(frame,receipt)){__j4Owner("verify-null",{document:__j4Anon(frame?.documentId),receiptPresent:!!receipt,reason:signal?.aborted?"ABORTED":!receipt?"NO_RECEIPT":"NOT_CURRENT"});diagnostic(\'association-no-current-receipt\');return null;}');
  inject("answer.association!=='explicit-body-id')){diagnostic('association-rejected');return null;}","answer.association!=='explicit-body-id')){__j4Owner(\"verify-null\",{document:__j4Anon(frame?.documentId),receiptPresent:true,reason:\"ASSOCIATION_OR_CURRENT_REJECTED\"});diagnostic('association-rejected');return null;}");
  inject('return matched?receipt:null;','const verified=matched?receipt:null;__j4Owner(verified?"verify-receipt":"verify-null",{document:__j4Anon(frame?.documentId),receiptPresent:true,reason:verified?"VERIFIED":"FRAME_OR_CURRENT_REJECTED"});return verified;');
  inject("}catch{diagnostic('association-failed-or-timeout');return null;}finally{finished=true;", '}catch{__j4Owner("verify-null",{document:__j4Anon(frame?.documentId),receiptPresent:true,reason:"DEADLINE_OR_EXCEPTION"});diagnostic(\'association-failed-or-timeout\');return null;}finally{finished=true;');
  inject('for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);','for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);__j4Owner("listeners-registered");');
 }else if(path==='src/runtime/host-browser-bootstrap.mjs'){
  inject('handlers=Object.freeze({...callbacks});','handlers=Object.freeze({...callbacks});__j4Owner("service-attached");');
 }else throw Error('j4-owner-path');
 return recorder+out;
}
export function j4ReenableOwnerTraceEnabled(env={}){const on=env.FREE_J4_REENABLE_OWNER_TRACE==='1';if(on&&Object.entries(env).some(([key,value])=>key.startsWith('FREE_J4_')&&key!=='FREE_J4_REENABLE_OWNER_TRACE'&&value==='1'))throw Error('reenable-owner-trace-requires-exclusive-mode');return on;}
export function validJ4OwnerSnapshot(value){
 const stages=['send','queued','complete','receipt-installed','drop','committed','verify-null','verify-receipt','listeners-registered','service-attached'];
 const reasons=['navigation','context-selection-pending','concurrent-context-conflict','request-failed','request-expired','context-expired','OTHER','ABORTED','NO_RECEIPT','NOT_CURRENT','ASSOCIATION_OR_CURRENT_REJECTED','FRAME_OR_CURRENT_REJECTED','VERIFIED','DEADLINE_OR_EXCEPTION'];
 const bools=['valid','conversation','project','tracked','receiptPresent','sameDocument','sameDocumentReceipt'],keys=['stage','sequence','at','document','request','reason',...bools];
 return !!value&&Object.keys(value).sort().join()==='dropped,labelsExhausted,rows'&&Number.isSafeInteger(value.dropped)&&value.dropped>=0&&typeof value.labelsExhausted==='boolean'&&Array.isArray(value.rows)&&value.rows.length<=512&&value.rows.every((r,i)=>r&&Object.keys(r).every(k=>keys.includes(k))&&stages.includes(r.stage)&&r.sequence===i+1&&Number.isFinite(r.at)&&['document','request'].every(k=>!Object.hasOwn(r,k)||r[k]===null||Number.isInteger(r[k])&&r[k]>0&&r[k]<=256)&&bools.every(k=>!Object.hasOwn(r,k)||typeof r[k]==='boolean')&&(!Object.hasOwn(r,'reason')||reasons.includes(r.reason)));
}
export async function collectJ4ReenableOwner(workers,{lifecycle,timeoutMs=1500}={}){
 const result={kind:J4_REENABLE_TRACE_KIND,causalConclusion:'NOT_ESTABLISHED',complete:false,workers:[],lifecycle,limitation:'Diagnostic copy changes timing; absent rows alone never prove an owner missed a native GET.'};
 if(workers.length<1||workers.length>4){result.reason='EXISTING_WORKER_COUNT_UNAVAILABLE';return result;}
 let timer,closed=false;const rows=workers.map((_,i)=>({ordinal:i,status:'PENDING'}));result.workers=rows;
 await Promise.race([Promise.all(workers.map(async(w,i)=>{try{const trace=await w.evaluate(()=>globalThis.__vaiwlJ4ReenableOwner??null);if(!closed)rows[i]=result.workers[i]=validJ4OwnerSnapshot(trace)?{ordinal:i,status:'READ',trace}:{ordinal:i,status:'INVALID_OR_MISSING_TRACE'};}catch{if(!closed)rows[i]=result.workers[i]={ordinal:i,status:'EXISTING_WORKER_UNREADABLE'};}})),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);closed=true;clearTimeout(timer);
 for(const row of result.workers)if(row.status==='PENDING')row.status='READ_TIMEOUT';
 const boundaries=lifecycle?.rows?.filter(r=>r.event==='boundary').map(r=>r.stage)??[];
 result.complete=lifecycle?.setup==='ENABLED'&&lifecycle.truncated===false&&['before-enable','enabled','before-reload','reloaded'].every(s=>boundaries.includes(s))&&rows.length===1&&rows[0].status==='READ'&&rows[0].trace.dropped===0&&!rows[0].trace.labelsExhausted&&['listeners-registered','service-attached'].every(stage=>rows[0].trace.rows.some(r=>r.stage===stage));
 return result;
}
