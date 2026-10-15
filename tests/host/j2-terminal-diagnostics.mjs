/** Test-only passive observation. No request bodies, credentials, business calls or timers. */
export function installJ2TerminalDiagnostics({origin}){
 if(globalThis.j2TerminalDiagnosticInstalled)return;
 globalThis.j2TerminalDiagnosticInstalled=true;globalThis.j2TerminalTrace=[];
 const labels=new Map();const label=value=>{if(typeof value!=='string'||!value||value.length>256)return null;if(!labels.has(value)){if(labels.size>=512)return 'overflow';labels.set(value,labels.size+1);}return labels.get(value);};
 const integer=v=>Number.isSafeInteger(v)&&v>=0?v:null,stamp=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=8640000000000000?v:null;
 const iso=v=>typeof v==='string'&&v.length===24&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
 const choice=(v,values)=>values.includes(v)?v:null;
 const push=row=>{if(j2TerminalTrace.length<256)j2TerminalTrace.push({observedAt:Date.now(),...row});};
 chrome.runtime.onMessage.addListener((message,sender)=>{try{
  if(message?.type==='HOST_OLD_SEND_OPERATION'){push({kind:'operation-candidate',intent:label(message.intentId),operation:label(message.operationId),message:label(message.messageId),proof:label(message.bodyProofId),document:label(sender.documentId),routeEpoch:integer(message.routeEpoch),intentAt:iso(message.observedAt)});return;}
  if(!['current-observation','current-object','send-candidate','surface-delta','surface-snapshot','current-metadata'].includes(message?.kind))return;
  if(!['vaiwl-host-observation/1','vaiwl-host-observation/2'].includes(message?.protocol))return;
  const p=message.kind==='current-observation'?message.payload?.body:message.payload;
  push({kind:message.kind,protocol:message.protocol,localSeq:integer(message.localSeq),routeEpoch:integer(message.routeEpoch),regionEpoch:integer(p?.regionEpoch??p?.evidence?.regionEpoch),proof:label(message.bodyProofId),document:label(sender.documentId),conversation:label(p?.conversationId),intent:label(p?.intentId),messageCount:Array.isArray(p?.messageIds)?p.messageIds.length:null});
 }catch{/* Malformed diagnostic metadata cannot interrupt message dispatch. */}});
 const filter={urls:[origin+'/native/j2/send'],types:['xmlhttprequest']};
 for(const event of ['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect']){
  const listener=d=>{try{const headers=Array.isArray(d.requestHeaders)&&d.requestHeaders.length<=128?d.requestHeaders:[],get=name=>{const h=headers.filter(h=>typeof h?.name==='string'&&h.name.length<=64&&h.name.toLowerCase()===name);return h.length===1?label(h[0].value):null;};push({kind:'browser-'+event,request:label(d.requestId),document:label(d.documentId),operation:get('x-j2-operation-id'),message:get('x-j2-message-id'),at:stamp(d.timeStamp),method:choice(d.method,['POST']),type:choice(d.type,['xmlhttprequest']),frameId:integer(d.frameId),documentLifecycle:choice(d.documentLifecycle,['active','cached','prerender','pending_deletion']),tabId:integer(d.tabId),initiatorMatches:d.initiator===origin,urlMatches:d.url===origin+'/native/j2/send',statusCode:Number.isInteger(d.statusCode)&&d.statusCode>=100&&d.statusCode<=599?d.statusCode:null,error:choice(d.error,['net::ERR_ABORTED','net::ERR_FAILED','net::ERR_BLOCKED_BY_CLIENT','net::ERR_CONNECTION_RESET']),fromCache:typeof d.fromCache==='boolean'?d.fromCache:null});}catch{/* Diagnostic failures never interrupt native request listeners. */}};
  if(event==='onSendHeaders')chrome.webRequest[event].addListener(listener,filter,['requestHeaders']);else chrome.webRequest[event].addListener(listener,filter);
 }
}
