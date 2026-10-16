/** Post-failure CDP inspection only. Never invoke application functions. */
export async function collectJ3FailureClosures(session,{executionContextId,timeoutMs=1500,maxFunctions=20000}={}){
 const objectGroup='j3-failure-closures';const report={kind:'POST_FAILURE_READ_ONLY_CLOSURES',functions:[],truncated:false};
 const send=async(method,params={})=>{let timer;try{return await Promise.race([session.send(method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('closure-inspection-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}};
 const properties=objectId=>send('Runtime.getProperties',{objectId,ownProperties:true,generatePreview:false});
 try{
  if(!Number.isInteger(maxFunctions)||maxFunctions<1||maxFunctions>20000)throw Error('invalid-function-limit');
  await send('Runtime.enable');
  const prototype=await send('Runtime.evaluate',{expression:'Function.prototype',objectGroup,...(executionContextId===undefined?{}:{contextId:executionContextId})});
  if(!prototype.result?.objectId)throw Error('missing-function-prototype');
  const heap=await send('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup});
  const selected=await send('Runtime.callFunctionOn',{objectId:heap.objects.objectId,objectGroup,arguments:[{value:maxFunctions}],functionDeclaration:`function(limit){const found=[];for(let i=0;i<Math.min(this.length,limit)&&found.length<8;i++){const f=this[i];if(typeof f!=='function')continue;const s=Function.prototype.toString.call(f);if((f.name==='contextReady'&&s.includes('contextResumeAllowed'))||(f.name.startsWith('verify')&&s.includes('receipt')&&s.includes('associatePage')))found.push(f);}return {found,truncated:this.length>limit};}`});
  const selection=await properties(selected.result.objectId);report.truncated=selection.result.find(p=>p.name==='truncated')?.value?.value===true;
  const found=selection.result.find(p=>p.name==='found')?.value?.objectId;if(!found)return report;
  const candidates=await properties(found);
  for(const item of candidates.result.filter(p=>/^\d+$/.test(p.name)).slice(0,8)){
   if(!item.value?.objectId)continue;const fn=await properties(item.value.objectId);const scopeId=fn.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;if(!scopeId)continue;
   const row={};const scopes=await properties(scopeId);
   for(const scope of scopes.result.filter(p=>/^\d+$/.test(p.name)).slice(0,12)){
    if(!scope.value?.objectId)continue;const vars=await properties(scope.value.objectId);
    for(const prop of vars.result.slice(0,128)){
     if(['enabled','contextResumeAllowed'].includes(prop.name)&&prop.value?.type==='boolean')row[prop.name]=prop.value.value;
     if(prop.name==='current'){
      row.currentPresent=prop.value?.subtype!=='null'&&!!prop.value?.objectId;
      if(row.currentPresent){const fields=await properties(prop.value.objectId);row.currentReady=fields.result.find(p=>p.name==='ready')?.value?.value===true;const scopeValue=fields.result.find(p=>p.name==='scopeKey')?.value;row.currentHasScope=!!scopeValue&&scopeValue.type!=='undefined'&&scopeValue.subtype!=='null';}
     }
     if(['requests','closedRequests','documents'].includes(prop.name)&&prop.value?.subtype==='map'){
      const summary=await send('Runtime.callFunctionOn',{objectId:prop.value.objectId,returnByValue:true,functionDeclaration:`function(){const reasons=['navigation','context-selection-pending','concurrent-context-conflict','request-failed','request-expired','context-expired'];const rows=[];for(const v of Map.prototype.values.call(this)){if(rows.length>=128)break;rows.push({accepted:v?.accepted===true,conflicted:v?.conflicted===true,receiptPresent:!!v?.receipt,reason:reasons.includes(v?.reason)?v.reason:null});}return {size:this.size,truncated:this.size>128,rows};}`});
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
