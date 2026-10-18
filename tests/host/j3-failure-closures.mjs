/** Data-only projection; safe to serialize into the existing inspection realm.
 * Only owner-created ordinary records are supported, not injected Proxy records.
 * Never read body/auth fields, invoke owner methods, or treat a snapshot as authority.
 */
export function summarizeContextOwnerMap(map,kind,targetDocumentId=null){
 if(!['documents','requests','closedRequests'].includes(kind))throw Error('invalid-context-map-kind');
 const own=(object,key)=>{if(object===null||typeof object!=='object')return undefined;const descriptor=Object.getOwnPropertyDescriptor(object,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;};
 const integer=value=>Number.isSafeInteger(value)&&value>=0;
 const equalEpoch=(left,right)=>integer(left)&&integer(right)?left===right:null;
 const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
 const sameDocument=(left,right)=>token(left)&&token(right)?left===right:null;
 const match=value=>token(targetDocumentId)?sameDocument(value,targetDocumentId):null;
 const reasons=['navigation','context-selection-pending','concurrent-context-conflict','request-failed','request-expired','context-expired'];
 const size=Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(map),rows=[];
 for(const value of Map.prototype.values.call(map)){
  if(rows.length>=128)break;
  const document=kind==='documents'?value:own(value,'document'),receipt=own(document,'receipt'),reason=own(document,'reason');
  const documentRow={receiptPresent:receipt!==null&&typeof receipt==='object',lastInvalidationReason:reasons.includes(reason)?reason:null,
   documentIdMatchesTarget:match(own(document,'documentId')),receiptDocumentMatchesOwner:sameDocument(own(receipt,'documentId'),own(document,'documentId')),
   receiptEpochMatchesDocument:equalEpoch(own(receipt,'selectionEpoch'),own(document,'epoch'))};
  if(kind==='documents')rows.push(documentRow);
  else rows.push({accepted:own(value,'accepted')===true,conflicted:own(value,'conflicted')===true,
   historyRetained:own(value,'historyRetained')===true,reprepareUsed:own(value,'reprepareUsed')===true,
   requestDocumentMatchesOwner:sameDocument(own(value,'documentId'),own(document,'documentId')),
   requestEpochMatchesDocument:equalEpoch(own(value,'epoch'),own(document,'epoch')),
   requestDocumentIdMatchesTarget:match(own(value,'documentId')),document:documentRow});
 }
 return {schema:kind==='documents'?'DOCUMENT_NOT_REQUEST':'REQUEST_PREPARATION_NOT_SUCCESS',size,truncated:size>128,targetDocumentAvailable:token(targetDocumentId),rows};
}
/** Post-failure CDP inspection only. Never invoke application functions. */
export async function collectJ3FailureClosures(session,{executionContextId,timeoutMs=1500,maxFunctions=20000,targetDocumentId=null,onDocumentIdentity=null}={}){
 const objectGroup='j3-failure-closures';const report={kind:'POST_FAILURE_READ_ONLY_CLOSURES',snapshot:'NON_ATOMIC_NOT_AUTHORITY',functions:[],truncated:false};const documentIdentities=[];let contentOwners=0;
 const send=async(method,params={})=>{let timer;try{return await Promise.race([session.send(method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('closure-inspection-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}};
 const properties=objectId=>send('Runtime.getProperties',{objectId,ownProperties:true,generatePreview:false});
 try{
  if(!Number.isInteger(maxFunctions)||maxFunctions<1||maxFunctions>20000||targetDocumentId!==null&&!(typeof targetDocumentId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(targetDocumentId)))throw Error('invalid-function-limit');
  await send('Runtime.enable');
  const prototype=await send('Runtime.evaluate',{expression:'Function.prototype',objectGroup,...(executionContextId===undefined?{}:{contextId:executionContextId})});
  if(!prototype.result?.objectId)throw Error('missing-function-prototype');
  const heap=await send('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup});
  const selected=await send('Runtime.callFunctionOn',{objectId:heap.objects.objectId,objectGroup,arguments:[{value:maxFunctions}],functionDeclaration:`function(limit){const found=[];for(let i=0;i<Math.min(this.length,limit)&&found.length<8;i++){const f=this[i];if(typeof f!=='function')continue;const s=Function.prototype.toString.call(f);if(!s.includes('contextResumeAllowed')&&!(s.includes('receipt')&&s.includes('associatePage')))continue;const name=Object.getOwnPropertyDescriptor(f,'name')?.value;if((name==='contextReady'&&s.includes('contextResumeAllowed'))||(typeof name==='string'&&name.startsWith('verify')&&s.includes('receipt')&&s.includes('associatePage')))found.push(f);}return {found,truncated:this.length>limit};}`});
  const selection=await properties(selected.result.objectId);report.truncated=selection.result.find(p=>p.name==='truncated')?.value?.value===true;
  const found=selection.result.find(p=>p.name==='found')?.value?.objectId;if(!found)return report;
  const candidates=await properties(found);if(candidates.result.filter(p=>/^\d+$/.test(p.name)).length>=8)report.truncated=true;
  for(const item of candidates.result.filter(p=>/^\d+$/.test(p.name)).slice(0,8)){
   if(!item.value?.objectId)continue;const fn=await properties(item.value.objectId);const scopeId=fn.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;if(!scopeId)continue;
   const row={},seenVariables=new Set();const name=fn.result.find(p=>p.name==='name')?.value?.value;if(name==='contextReady')contentOwners++;const scopes=await properties(scopeId);if(scopes.result.filter(p=>/^\d+$/.test(p.name)).length>12)report.truncated=true;
   for(const scope of scopes.result.filter(p=>/^\d+$/.test(p.name)).slice(0,12)){
    if(!scope.value?.objectId||scope.value.description==='Global')continue;const vars=await properties(scope.value.objectId);if(vars.result.length>128)report.truncated=true;
    for(const prop of vars.result.slice(0,128)){
     // The first lexical binding wins, including null or an accessor. An outer
     // variable with the same name cannot stand in for a missing current owner.
     if(seenVariables.has(prop.name))continue;seenVariables.add(prop.name);
     if(['active','enabled','contextResumeAllowed'].includes(prop.name)&&prop.value?.type==='boolean')row[prop.name]=prop.value.value;
     if(prop.name==='current'){
      row.currentPresent=prop.value?.subtype!=='null'&&!!prop.value?.objectId;
      if(row.currentPresent){const fields=await properties(prop.value.objectId);row.currentReady=fields.result.find(p=>p.name==='ready')?.value?.value===true;const scopeValue=fields.result.find(p=>p.name==='scopeKey')?.value;row.currentHasScope=!!scopeValue&&scopeValue.type!=='undefined'&&scopeValue.subtype!=='null';const binding=fields.result.find(p=>p.name==='binding')?.value?.objectId;if(name==='contextReady'&&binding){const propertiesOfBinding=await properties(binding),identity=propertiesOfBinding.result.find(p=>p.name==='browserDocumentId')?.value;row.currentDocumentIdentityAvailable=identity?.type==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(identity.value);if(row.currentDocumentIdentityAvailable)documentIdentities.push(identity.value);}}
     }
     if(['requests','closedRequests','documents'].includes(prop.name)&&prop.value?.subtype==='map'){
      const summary=await send('Runtime.callFunctionOn',{objectId:prop.value.objectId,returnByValue:true,arguments:[{value:prop.name},{value:targetDocumentId}],functionDeclaration:`function(kind,target){return (${summarizeContextOwnerMap.toString()})(this,kind,target);}`});
      row[prop.name]=summary.result.value;if(row[prop.name]?.truncated)report.truncated=true;
     }
    }
   }
   report.functions.push(row);
  }
 }catch(error){report.error=error?.message==='closure-inspection-timeout'?'timeout':'inspection-unavailable';}
 finally{try{await send('Runtime.releaseObjectGroup',{objectGroup});}catch{}try{let timer;await Promise.race([session.detach(),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]).finally(()=>clearTimeout(timer));}catch{}}
 if(typeof onDocumentIdentity==='function'&&!report.error&&!report.truncated&&contentOwners===1&&documentIdentities.length===1){try{onDocumentIdentity(documentIdentities[0]);}catch{}}
 return report;
}
