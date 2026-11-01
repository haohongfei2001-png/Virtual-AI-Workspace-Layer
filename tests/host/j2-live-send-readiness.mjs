/** Test-only existing isolated-world descriptor reads. Never calls app functions. */
export function summarizeJ2LiveSend(s,adapter,binding,accepted,root,messages,bodyEpoch,adapterStopped,discoveryStopped,adapterURL,ownerDocument,enabled,expectedConversation){
 const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
 const result={currentDocument:ownerDocument===document,sessionReady:enabled===true&&own(s,'ready')===true&&!own(s,'closing')&&!own(s,'wakePending')&&own(s,'url')===location.href&&own(s,'abort')?.signal?.aborted===false,adapterOwned:own(s,'adapter')===adapter,adapterLive:adapterStopped===false&&discoveryStopped===false&&adapterURL===location.href,bindingCurrent:false,proofCurrent:false,nativeBodyMatches:false};
 const currentBinding=own(s,'binding'),time=Date.now();
 result.bindingCurrent=!!binding&&!!currentBinding&&['documentToken','producerToken','browserDocumentId','routeEpoch','origin'].every(k=>own(binding,k)!==undefined&&own(binding,k)===own(currentBinding,k))&&Date.parse(own(binding,'expiresAt'))>time&&Date.parse(own(currentBinding,'expiresAt'))>time;
 let body;try{body=JSON.parse(own(accepted,'fingerprint'));}catch{}
 result.proofCurrent=typeof own(accepted,'proofId')==='string'&&own(accepted,'proofId').length>0&&Number.isInteger(own(accepted,'bodyEpoch'))&&Date.parse(own(accepted,'validUntil'))>time&&body?.association==='explicit-body-id'&&body.conversationId===expectedConversation&&body.regionEpoch===bodyEpoch;
 const visible=n=>{if(!n?.isConnected||n.ownerDocument!==document||!n.getClientRects().length)return false;for(let p=n;p;p=p.parentElement){const style=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;}return true;};
 const roots=document.querySelectorAll('main > #reading');
 if(roots.length===1&&roots[0]===root&&visible(root)&&root.getAttribute('data-conversation-id')===expectedConversation&&location.pathname==='/c/'+expectedConversation&&Array.isArray(body?.messageIds)){
  const nodes=[...root.querySelectorAll('[data-message-id]')];if(nodes.length<=256){const shown=nodes.filter(visible),ids=shown.map(n=>n.getAttribute('data-message-id'));try{result.nativeBodyMatches=JSON.stringify(ids)===JSON.stringify(body.messageIds)&&new Set(ids).size===ids.length&&shown.every((n,i)=>Map.prototype.get.call(messages,ids[i])===n)&&Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(messages)===shown.length;}catch{}}
 }
 return {...result,ready:Object.values(result).every(v=>v===true)};
}
export function finalJ2LiveSendIdentity(current,adapter,accepted,acceptedAfter,binding,bindingAfter,epoch,adapterStopped,discoveryStopped){
 const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined,time=Date.now(),currentBinding=own(this,'binding');
 return this===current&&own(this,'ready')===true&&!own(this,'abort')?.signal?.aborted&&own(this,'url')===location.href&&own(this,'adapter')===adapter&&accepted===acceptedAfter&&binding===bindingAfter&&own(this,'run')===epoch&&adapterStopped===false&&discoveryStopped===false&&Date.parse(own(binding,'expiresAt'))>time&&Date.parse(own(currentBinding,'expiresAt'))>time&&Date.parse(own(accepted,'validUntil'))>time;
}
export async function waitJ2LiveSendReadiness({context,page,extensionId,conversationId,timeoutMs=25000,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(timeoutMs!==25000)throw Error('invalid-j2-readiness-budget');
 const end=now()+timeoutMs,workEnd=end-250,origin='chrome-extension://'+extensionId,worlds=new Map();let session,closed=false,last={ready:false},attempts=0;
 const left=()=>{const n=workEnd-now();if(n<=0)throw Error('J2-live-send-precondition-NOT_ESTABLISHED');return n;};
 const bounded=async(fn,cleanup=false)=>{const ms=(cleanup==='detach'?end:cleanup?end-125:workEnd)-now();if(ms<=0)throw Error('J2-live-send-precondition-NOT_ESTABLISHED');let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('J2-live-send-precondition-NOT_ESTABLISHED')),ms);})]);}finally{clearTimeout(timer);}};
 const acquire=Promise.resolve().then(()=>context.newCDPSession(page));acquire.then(s=>{if(closed)void s.detach().catch(()=>{});},()=>{});
 const cleared=()=>worlds.clear();
 const created=({context:c})=>{if(worlds.size<64)worlds.set(c.id,c);},destroyed=({executionContextId:id})=>worlds.delete(id);
 try{
  session=await bounded(()=>acquire);session.on('Runtime.executionContextCreated',created);session.on('Runtime.executionContextDestroyed',destroyed);session.on('Runtime.executionContextsCleared',cleared);await bounded(()=>session.send('Runtime.enable'));
  const send=(m,p={},cleanup=false)=>bounded(()=>session.send(m,p),cleanup),props=async id=>(await send('Runtime.getProperties',{objectId:id,ownProperties:true})).result??[];
  const scopes=async(fn,names)=>{const f=await send('Runtime.getProperties',{objectId:fn,ownProperties:true}),id=f.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;if(!id)return {};const out={};for(const scope of (await props(id)).filter(p=>/^\d+$/.test(p.name)).slice(0,12)){if(!scope.value?.objectId)continue;for(const p of await props(scope.value.objectId))if(names.includes(p.name)&&!Object.hasOwn(out,p.name)&&p.value)out[p.name]={...p.value,scope:scope.value.objectId};if(names.every(n=>Object.hasOwn(out,n)))break;}return out;};
  const arg=v=>v?.objectId?{objectId:v.objectId}:{value:v?.value};
  while(left()>0){attempts++;const group='j2-live-readiness-'+attempts;
   try{
    const tree=await send('Page.getFrameTree'),top=tree.frameTree?.frame?.id,matches=[...worlds.values()].filter(c=>c.auxData?.frameId===top&&c.auxData?.isDefault===false&&(c.origin===origin||c.name===origin));let owners=[];
    if(matches.length!==1)throw Error('unavailable-current-world');
    for(const c of matches){const p=await send('Runtime.evaluate',{contextId:c.id,expression:'Function.prototype',objectGroup:group});if(!p.result?.objectId)continue;const heap=await send('Runtime.queryObjects',{prototypeObjectId:p.result.objectId,objectGroup:group});const found=await send('Runtime.callFunctionOn',{objectId:heap.objects.objectId,objectGroup:group,functionDeclaration:`function(){if(this.length>20000)return null;const out=[];for(const f of this){if(typeof f==='function'&&f.name==='contextReady'&&Function.prototype.toString.call(f).includes('contextResumeAllowed'))out.push(f);if(out.length>8)return null;}return out;}`});if(!found.result?.objectId)throw Error('owner-enumeration-unavailable');for(const fn of (await props(found.result.objectId)).filter(p=>/^\d+$/.test(p.name))){const v=await scopes(fn.value.objectId,['current','enabled','doc','epoch']);if(v.enabled?.value!==true||!v.current?.objectId||!v.doc?.objectId)continue;const same=await send('Runtime.callFunctionOn',{objectId:v.doc.objectId,functionDeclaration:'function(){return this===document;}',returnByValue:true});if(same.result?.value===true)owners.push(v);}}
    if(owners.length!==1)throw Error('ambiguous-or-missing-live-owner');const owner=owners[0],s=owner.current,fields=await props(s.objectId),adapter=fields.find(p=>p.name==='adapter')?.value,start=adapter?.objectId&&(await props(adapter.objectId)).find(p=>p.name==='start')?.value;
    if(!start?.objectId)throw Error('current-adapter-unavailable');const a=await scopes(start.objectId,['acceptedBody','binding','bodyDiscovery','stopped','url','generation']);const scan=a.bodyDiscovery?.objectId&&(await props(a.bodyDiscovery.objectId)).find(p=>p.name==='scan')?.value;if(!scan?.objectId)throw Error('current-body-unavailable');const body=await scopes(scan.objectId,['lastRoot','lastMessages','epoch','stopped']);
    const values=[s,adapter,a.binding,a.acceptedBody,body.lastRoot,body.lastMessages,body.epoch,a.stopped,body.stopped,a.url,owner.doc,owner.enabled,{value:conversationId}];
    if(values.some(v=>v===undefined))throw Error('required-live-descriptor-unavailable');const sample=await send('Runtime.callFunctionOn',{objectId:s.objectId,functionDeclaration:summarizeJ2LiveSend.toString(),arguments:values.map(arg),returnByValue:true});last=sample.result?.value??{ready:false};
    const currentAfter=(await props(owner.current.scope)).find(p=>p.name==='current')?.value,enabledAfter=(await props(owner.enabled.scope)).find(p=>p.name==='enabled')?.value;
    const afterAdapter=await scopes(start.objectId,['acceptedBody','binding','generation','stopped']),afterBody=await scopes(scan.objectId,['epoch','stopped']),ownerEpochAfter=(await props(owner.epoch.scope)).find(p=>p.name==='epoch')?.value;
    const stable=currentAfter?.objectId&&await send('Runtime.callFunctionOn',{objectId:s.objectId,functionDeclaration:finalJ2LiveSendIdentity.toString(),arguments:[arg(currentAfter),arg(adapter),arg(a.acceptedBody),arg(afterAdapter.acceptedBody),arg(a.binding),arg(afterAdapter.binding),arg(ownerEpochAfter),arg(afterAdapter.stopped),arg(afterBody.stopped)],returnByValue:true});
    if(last.ready===true&&stable?.result?.value===true&&enabledAfter?.value===true&&ownerEpochAfter?.value===owner.epoch?.value&&afterBody.epoch?.value===body.epoch?.value&&afterAdapter.generation?.value===a.generation?.value){left();return {status:'ESTABLISHED_CURRENT_LIVE_SEND_PRECONDITION',attempts,facts:last};}
   }catch{throw Error('J2-live-send-precondition-NOT_ESTABLISHED');}finally{await send('Runtime.releaseObjectGroup',{objectGroup:group},true);}
   await bounded(()=>pause(Math.min(80,left())));
  }
 }catch{throw Error('J2-live-send-precondition-NOT_ESTABLISHED');}finally{closed=true;if(session){session.off('Runtime.executionContextCreated',created);session.off('Runtime.executionContextDestroyed',destroyed);session.off('Runtime.executionContextsCleared',cleared);const detach=session.detach();await bounded(()=>detach,'detach').catch(()=>{throw Error('J2-live-send-precondition-NOT_ESTABLISHED');});}}
 throw Error('J2-live-send-precondition-NOT_ESTABLISHED');
}
