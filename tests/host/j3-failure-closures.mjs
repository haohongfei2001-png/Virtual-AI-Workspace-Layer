/** Post-failure CDP inspection only. Never invoke application functions. */
function summarizeRecoverySlots(expectedURL){
 const states=['CHECKING','WAITING_NATIVE','BLOCKED','AUTHORIZING','SCOPE_VERIFIED','CANCELLED'];
 const reasons=['existing-authorization-pending','context-profile-unavailable','current-context-unproven','context-recovery-new-evidence-required','scope-not-verified','scope-provider-unavailable','context-recovery-cancelled','context-recovery-capacity','context-recovery-deadline','context-recovery-stale-evidence','context-recovery-superseded','context-recovery-document-replaced','context-recovery-failed','context-recovery-invalidated','context-recovery-stopped','context-recovery-proof-expired'];
 const unknown=Symbol(),own=(o,k)=>{if(!o||typeof o!=='object')return unknown;const d=Object.getOwnPropertyDescriptor(o,k);return d===undefined?undefined:Object.hasOwn(d,'value')?d.value:unknown;};
 const present=v=>v===null||v===undefined?false:v&&typeof v==='object'?true:null;
 const bool=v=>typeof v==='boolean'?v:null,rows=[];
 for(const value of Map.prototype.values.call(this)){
  if(rows.length>=128)break;
  const state=own(value,'state'),reason=own(value,'reason'),frame=own(value,'frame'),url=own(frame,'actualURL'),flight=own(value,'flight'),delivery=own(value,'delivery'),generation=own(value,'generation');
  const generationMatches=entry=>Number.isSafeInteger(generation)&&generation>=0&&Number.isSafeInteger(own(entry,'generation'))?generation===own(entry,'generation'):null;
  rows.push({state:states.includes(state)?state:null,reason:reasons.includes(reason)?reason:null,waiting:bool(own(value,'waiting')),flightPresent:present(flight),deliveryPresent:present(delivery),routeMatches:expectedURL===null||typeof url!=='string'?null:url===expectedURL,internalFlightGenerationMatches:generationMatches(flight),internalDeliveryGenerationMatches:generationMatches(delivery)});
 }
 const size=Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(this);
 // URL equality cannot select a tab/document/generation or prove live scope.
 // The recorded SCOPE_VERIFIED policy can survive expiry until inspect() runs;
 // invoking that application method here would mutate the state under study.
 return {historyOnly:true,currentAuthority:'NOT_ESTABLISHED',targetDocumentMatch:null,targetGenerationMatch:null,size,truncated:size>128,rows};
}
export async function collectJ3FailureClosures(session,{executionContextId,timeoutMs=1500,maxFunctions=20000,expectedURL=null}={}){
 const objectGroup='j3-failure-closures';const report={kind:'POST_FAILURE_READ_ONLY_CLOSURES',functions:[],truncated:false};
 const send=async(method,params={})=>{let timer;try{return await Promise.race([session.send(method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('closure-inspection-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}};
 const properties=objectId=>send('Runtime.getProperties',{objectId,ownProperties:true,generatePreview:false});
 try{
  if(expectedURL!==null){const url=new URL(expectedURL);if(url.origin!=='http://127.0.0.1:'+url.port||!url.port||url.username||url.password||expectedURL.length>2048)throw Error('invalid-inspection-route');}
  if(!Number.isInteger(maxFunctions)||maxFunctions<1||maxFunctions>20000)throw Error('invalid-function-limit');
  await send('Runtime.enable');
  const prototype=await send('Runtime.evaluate',{expression:'Function.prototype',objectGroup,...(executionContextId===undefined?{}:{contextId:executionContextId})});
  if(!prototype.result?.objectId)throw Error('missing-function-prototype');
  const heap=await send('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup});
  const selected=await send('Runtime.callFunctionOn',{objectId:heap.objects.objectId,objectGroup,arguments:[{value:maxFunctions}],functionDeclaration:`function(limit){const found=[];for(let i=0;i<Math.min(this.length,limit)&&found.length<8;i++){const f=this[i];if(typeof f!=='function')continue;const s=Function.prototype.toString.call(f);if((f.name==='contextReady'&&s.includes('contextResumeAllowed'))||(f.name.startsWith('verify')&&s.includes('receipt')&&s.includes('associatePage'))||(f.name==='listener'&&s.includes('HOST_CONTEXT_ASSOCIATE')&&s.includes('HOST_CONTEXT_PENDING')&&s.includes('onPending'))||(f.name==='run'&&s.includes('invalid-context-recovery-call')&&s.includes('context-recovery-superseded')))found.push(f);}return {found,truncated:this.length>limit||found.length===8};}`});
  const selection=await properties(selected.result.objectId);report.truncated=selection.result.find(p=>p.name==='truncated')?.value?.value===true;
  const found=selection.result.find(p=>p.name==='found')?.value?.objectId;if(!found)return report;
  const candidates=await properties(found);
  for(const item of candidates.result.filter(p=>/^\d+$/.test(p.name)).slice(0,8)){
   if(!item.value?.objectId)continue;const fn=await properties(item.value.objectId);const scopeId=fn.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;if(!scopeId)continue;
   const row={};const scopes=await properties(scopeId);
   for(const scope of scopes.result.filter(p=>/^\d+$/.test(p.name)).slice(0,12)){
    if(!scope.value?.objectId)continue;const vars=await properties(scope.value.objectId);
    for(const prop of vars.result.slice(0,128)){
     if(prop.name==='slots'&&prop.value?.subtype==='map'){
      const summary=await send('Runtime.callFunctionOn',{objectId:prop.value.objectId,returnByValue:true,arguments:[{value:expectedURL}],functionDeclaration:summarizeRecoverySlots.toString()});
      row.recoveryPolicy=summary.result.value;
     }
     if(prop.name==='ttl'&&Number.isInteger(prop.value?.value)&&prop.value.value>0&&prop.value.value<=60000)row.contextTtlMs=prop.value.value;
     if(['active','enabled','contextResumeAllowed'].includes(prop.name)&&prop.value?.type==='boolean')row[prop.name]=prop.value.value;
     if(prop.name==='pending'){
      row.associationPending=prop.value?.subtype!=='null'&&!!prop.value?.objectId;
      if(row.associationPending){const summary=await send('Runtime.callFunctionOn',{objectId:prop.value.objectId,returnByValue:true,arguments:[{value:expectedURL}],functionDeclaration:`function(expectedURL){const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;const msg=own(this,'message'),wall=Date.now(),elapsed=performance.now(),until=own(this,'until'),started=own(this,'started'),budget=own(this,'budget');return {routeMatches:expectedURL===null||typeof own(msg,'actualURL')!=='string'?null:own(msg,'actualURL')===expectedURL,deadlineValid:Number.isFinite(until)&&Number.isFinite(started)&&Number.isFinite(budget)?wall<until&&elapsed>=started&&elapsed-started<budget:null,project:typeof own(msg,'projectId')==='string',conversation:typeof own(msg,'conversationId')==='string'};}`});row.association=summary.result.value;}
     }
     if(prop.name==='current'){
      row.currentPresent=prop.value?.subtype!=='null'&&!!prop.value?.objectId;
      if(row.currentPresent){const fields=await properties(prop.value.objectId);row.currentReady=fields.result.find(p=>p.name==='ready')?.value?.value===true;const scopeValue=fields.result.find(p=>p.name==='scopeKey')?.value;row.currentHasScope=!!scopeValue&&scopeValue.type!=='undefined'&&scopeValue.subtype!=='null';}
     }
     if(['requests','closedRequests','documents'].includes(prop.name)&&prop.value?.subtype==='map'){
      const summary=await send('Runtime.callFunctionOn',{objectId:prop.value.objectId,returnByValue:true,arguments:[{value:expectedURL}],functionDeclaration:`function(expectedURL){const reasons=['navigation','context-selection-pending','concurrent-context-conflict','request-failed','request-expired','context-expired'];const unknown=Symbol(),own=(o,k)=>{if(!o||typeof o!=='object')return unknown;const d=Object.getOwnPropertyDescriptor(o,k);return d===undefined?undefined:Object.hasOwn(d,'value')?d.value:unknown;};const equal=(a,b)=>a!==unknown&&b!==unknown&&a!==undefined&&b!==undefined?a===b:null,age=(at,start)=>Number.isFinite(at)&&Number.isFinite(start)?at-start:null;const wall=Date.now(),elapsed=performance.now(),rows=[];for(const v of Map.prototype.values.call(this)){if(rows.length>=128)break;const receipt=own(v,'receipt'),reason=own(v,'reason'),receiptPresent=receipt===null||receipt===undefined?false:receipt&&typeof receipt==='object'?true:null;rows.push({accepted:own(v,'accepted')===true,conflicted:own(v,'conflicted')===true,receiptPresent,reason:reasons.includes(reason)?reason:null,...(receiptPresent===true?{receipt:{epochMatches:equal(own(v,'epoch'),own(receipt,'selectionEpoch')),documentMatches:equal(own(v,'documentId'),own(receipt,'documentId')),tabMatches:equal(own(v,'tabId'),own(receipt,'tabId')),contextMatches:equal(own(v,'contextId'),own(receipt,'contextId')),routeMatches:expectedURL===null||typeof own(receipt,'actualURL')!=='string'?null:own(receipt,'actualURL')===expectedURL,wallAgeMs:age(wall,own(receipt,'wall')),elapsedAgeMs:age(elapsed,own(receipt,'elapsed'))}}:{})});}const size=Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(this);return {size,truncated:size>128,rows};}`});
      row[prop.name]=summary.result.value;
     }
    }
   }
   report.functions.push(row);
  }
 }catch(error){report.error=error?.message==='closure-inspection-timeout'?'timeout':'inspection-unavailable';}
 finally{try{await send('Runtime.releaseObjectGroup',{objectGroup});}catch{}try{let timer;await Promise.race([session.detach(),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]).finally(()=>clearTimeout(timer));}catch{}}
 return report;
}
