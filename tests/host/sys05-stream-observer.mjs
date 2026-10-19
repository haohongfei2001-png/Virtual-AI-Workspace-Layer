// Installed in the ALREADY EXISTING extension isolated world through CDP after
// genuine readiness. Source package bytes are untouched. Wrappers return original
// node/NodeList/walker/Promise objects except the explicitly armed one-proposal
// fault. Passive mode introduces only observation overhead.
export function installSys05Observer({directoryGap=false,lostAck=false}={}){
 if(lostAck&&!directoryGap)throw Error('sys05-lost-ack-requires-directory');
 if(globalThis.__sys05Observer)throw Error('sys05-observer-already-installed');
 const counters={directoryWalkers:0,directoryVisits:0,bodyQueries:0,bodySelected:0,packets:0,accepted:0,duplicate:0,retryAfter:0,rejected:0,unknown:0,maxBytes:0,maxCandidates:0,maxMessageIds:0,traceDropped:0,observerErrors:0};
 const producers=new Map();let gapArmed=false,gapPackets=0,gapDropped=0,gapSelected=null;const gapSeen=new Set();
 const directoryId=id=>typeof id==='string'&&/^88888888-8888-4888-8888-\d{12}$/.test(id);
 const renewals=[],packets=[],walkers=new WeakSet(),restore=[];
 const patch=(object,key,make)=>{const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];object[key]=make(original);if(object[key]===original)throw Error('sys05-observer-install-failed:'+key);restore.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});};
 try{
  patch(Document.prototype,'createTreeWalker',original=>function(...args){const walker=Reflect.apply(original,this,args),root=args[0];if(root?.matches?.('aside section[aria-label="Projects"],aside nav[aria-label="Chat history"],main #reading nav[aria-label="Project conversations"]')){counters.directoryWalkers++;walkers.add(walker);}return walker;});
  patch(TreeWalker.prototype,'nextNode',original=>function(...args){const node=Reflect.apply(original,this,args);if(node&&walkers.has(this))counters.directoryVisits++;return node;});
  patch(Element.prototype,'querySelectorAll',original=>function(...args){const nodes=Reflect.apply(original,this,args);if(this.id==='reading'&&args[0]==='[data-message-id]'){counters.bodyQueries++;counters.bodySelected+=nodes.length;}return nodes;});
  patch(chrome.runtime,'sendMessage',original=>function(...args){
   const message=args[0],observation=['vaiwl-host-observation/1','vaiwl-host-observation/2'].includes(message?.protocol);
   const directoryIds=message?.kind==='surface-delta'?(message.payload?.candidates??[]).map(c=>c.target?.nativeId).filter(directoryId):[];
   const gapKey=observation&&directoryGap&&gapArmed&&directoryIds.length?JSON.stringify([message.producerToken,message.localSeq]):null;
   const fresh=gapKey!==null&&!gapSeen.has(gapKey);if(fresh){gapSeen.add(gapKey);gapPackets++;}
   if(fresh&&gapPackets===2)gapSelected=gapKey;
   const designated=gapKey!==null&&gapKey===gapSelected&&gapDropped===0,drop=designated&&!lostAck;
   if(drop)gapDropped++;
   // Explicit fault only: either do not forward the selected proposal, or
   // discard its genuine accepted reply. Keep the selection across retry-after;
   // never substitute another packet when the selected owner has not accepted.
   const ownerReply=designated&&lostAck?{state:null,localSeq:null,at:null}:null;
   const forwarded=drop?null:Reflect.apply(original,this,args);
   const result=drop?Promise.reject(Error('sys05-designated-proposal-not-delivered')):ownerReply?forwarded.then(reply=>{
    ownerReply.state=reply?.state??null;ownerReply.localSeq=reply?.localSeq??null;ownerReply.at=Date.now();
    // Discard only a genuine successful response. A retry/rejection is left
    // unchanged and cannot satisfy the committed-but-lost-ACK oracle.
    if(reply?.state==='accepted'&&reply.localSeq===message.localSeq){if(gapDropped===0){gapDropped++;throw Error('sys05-designated-accepted-reply-lost');}}
    return reply;
   }):forwarded;
   if(message?.type==='HOST_DOCUMENT_RENEW')try{const row={at:Date.now(),finishedAt:null,state:'pending'};if(renewals.length<256)renewals.push(row);else counters.traceDropped++;result.then(reply=>{row.finishedAt=Date.now();row.state=reply?.ok===true?'ok':'denied';},()=>{row.finishedAt=Date.now();row.state='error';});}catch{counters.observerErrors++;}
   if(observation)try{const surface=message.kind==='current-observation'?message.payload?.surface:message.kind==='surface-delta'?message.payload:null,body=message.kind==='current-observation'?message.payload?.body:message.kind==='current-object'?message.payload:null;
    if(!producers.has(message.producerToken)&&producers.size<256)producers.set(message.producerToken,producers.size+1);
    const row={directoryIds,forwarded:!drop,fault:drop?'DROP_BEFORE_FORWARD':null,...(ownerReply?{ownerReply}:{}),producer:producers.get(message.producerToken)??null,payloadSha256:null,replySeq:null,at:Date.now(),kind:message.kind,localSeq:message.localSeq,bytes:new TextEncoder().encode(JSON.stringify(message)).length,candidates:surface?.candidates?.length??0,messageIds:body?.messageIds?.length??0,peerRenameTitle:surface?.candidates?.some(c=>c.entity==='conversation'&&c.target?.nativeId==='33333333-3333-4333-8333-333333333333'&&c.nativeTitle==='SYS05 peer native renamed conversation')??false,jointTitle:surface?.candidates?.some(c=>c.entity==='conversation'&&c.target?.nativeId==='44444444-4444-4444-8444-444444444444'&&c.nativeTitle==='J4 native jointly renamed conversation')??false,state:'pending',finishedAt:null};counters.packets++;counters.maxBytes=Math.max(counters.maxBytes,row.bytes);counters.maxCandidates=Math.max(counters.maxCandidates,row.candidates);counters.maxMessageIds=Math.max(counters.maxMessageIds,row.messageIds);
    crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(message.payload))).then(buffer=>{row.payloadSha256=Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');},()=>{counters.observerErrors++;});
    if(packets.length<256)packets.push(row);else counters.traceDropped++;
    if(result?.then)result.then(reply=>{row.finishedAt=Date.now();row.replySeq=reply?.localSeq??null;row.state=['accepted','duplicate','retry-after','rejected'].includes(reply?.state)?reply.state:'unknown';counters[row.state==='retry-after'?'retryAfter':row.state]++;},()=>{row.finishedAt=Date.now();row.state='unknown';if(ownerReply?.state==='accepted'&&ownerReply.localSeq===message.localSeq)row.fault='DROP_AFTER_ACCEPT';counters.unknown++;});
    else{row.state='unknown';counters.unknown++;}
   }catch{counters.observerErrors++;}return result;
  });
 }catch(error){for(const undo of restore.reverse())undo();throw error;}
 globalThis.__sys05Observer={armDirectoryGap(){if(!directoryGap||gapArmed)throw Error('sys05-gap-once-only');gapArmed=true;return {armedAt:Date.now()};},snapshot:()=>({at:Date.now(),gap:{enabled:directoryGap,armed:gapArmed,dropped:gapDropped},counters:{...counters},packets:packets.map(p=>({...p})),renewals:renewals.map(r=>({...r}))}),close(){for(const undo of restore.reverse())undo();delete globalThis.__sys05Observer;}};
 return {kind:directoryGap?(lostAck?'ISOLATED_WORLD_ONE_ACCEPTED_REPLY_LOST_FAULT':'ISOLATED_WORLD_ONE_UNDELIVERED_PROPOSAL_FAULT'):'ISOLATED_WORLD_PASSIVE_WRAPPERS',packageModified:false,methodIdentityChanged:true,returnedObjectIdentityPreserved:!directoryGap,timing:'INSTRUMENTED_SINGLE_SAMPLE_NOT_P95'};
}
export async function attachSys05Observer(context,page,extensionId,{directoryGap=false,lostAck=false}={}){
 const session=await context.newCDPSession(page),contexts=[];
 session.on('Runtime.executionContextCreated',event=>contexts.push(event.context));
 await session.send('Runtime.enable');
 const matches=[];
 for(const item of contexts){try{const v=await session.send('Runtime.evaluate',{contextId:item.id,expression:`typeof document !== 'undefined' && globalThis.chrome?.runtime?.id === ${JSON.stringify(extensionId)} && location.protocol === 'http:'`,returnByValue:true});if(v.result.value===true)matches.push(item.id);}catch{}}
 if(matches.length!==1){await session.detach();throw Error('sys05-unique-existing-isolated-world-required:'+matches.length);}
 const contextId=matches[0];
 async function evaluate(expression){const v=await session.send('Runtime.evaluate',{contextId,expression,returnByValue:true});if(v.exceptionDetails)throw Error('sys05-observer-evaluation-failed');return v.result.value;}
 const instrumentation=await evaluate(`(${installSys05Observer.toString()})(${JSON.stringify({directoryGap,lostAck})})`);
 return {instrumentation,armDirectoryGap:()=>evaluate('__sys05Observer.armDirectoryGap()'),snapshot:()=>evaluate('__sys05Observer.snapshot()'),async close(){try{await evaluate('__sys05Observer.close()');}finally{await session.detach();}}};
}
