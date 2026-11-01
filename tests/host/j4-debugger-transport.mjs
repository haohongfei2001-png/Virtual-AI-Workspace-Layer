import {EventEmitter} from 'node:events';
// One independent connection to the already-running isolated browser. Flattened
// session IDs stay on the wire; Playwright neither owns nor routes this session.
export async function connectJ4Debugger(endpoint,{Socket=WebSocket,budgetMs=20000}={}){
 const endpointMatch=/^ws:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/devtools\/browser\/[a-zA-Z0-9-]+$/.exec(endpoint);if(!endpointMatch||Number(endpointMatch[1])>65535)throw Error('J4-invalid-debug-endpoint');
 if(!Number.isSafeInteger(budgetMs)||budgetMs<1||budgetMs>20000)throw Error('J4-invalid-debug-deadline');const deadline=Date.now()+budgetMs;let watchdog;
 const socket=new Socket(endpoint),events=new EventEmitter(),requests=new Map();let sequence=0,closed=false;
 const fail=reason=>{if(closed)return;closed=true;clearTimeout(watchdog);for(const pending of requests.values())pending.reject(reason);requests.clear();events.emit('transportClosed',{reason:reason.message});};
 socket.addEventListener('close',()=>fail(Error('J4-debug-transport-closed')));
 socket.addEventListener('error',()=>fail(Error('J4-debug-transport-error')));
 socket.addEventListener('message',event=>{
  let message;try{message=JSON.parse(event.data);}catch{fail(Error('J4-debug-transport-invalid-message'));socket.close();return;}
  if(message.id){const pending=requests.get(message.id);if(!pending)return;requests.delete(message.id);if(message.sessionId!==pending.sessionId){pending.reject(Error('J4-debug-session-mismatch'));return;}message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result);return;}
  if(message.method==='Target.detachedFromTarget')for(const [id,pending]of requests)if(pending.sessionId===message.params?.sessionId){requests.delete(id);pending.reject(Error('J4-debug-target-detached'));}
  // Compatibility with the runner's existing session-scoped event consumer.
  if(message.sessionId)events.emit('Target.receivedMessageFromTarget',{sessionId:message.sessionId,message:JSON.stringify({method:message.method,params:message.params})});
  else events.emit(message.method,message.params);
 });
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.close();reject(Error('J4-debug-connect-timeout'));},Math.max(0,deadline-Date.now()));socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('J4-debug-connect-error'));},{once:true});socket.addEventListener('close',()=>{clearTimeout(timeout);reject(Error('J4-debug-connect-closed'));},{once:true});});
 // One deadline covers connection, setup commands and the pause observation.
 // No silent command gets a new20-second window.
 watchdog=setTimeout(()=>{fail(Error('J4-debug-transport-deadline'));socket.close();},Math.max(0,deadline-Date.now()));
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{if(closed){reject(Error('J4-debug-transport-closed'));return;}const id=++sequence;requests.set(id,{resolve,reject,sessionId});try{socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));}catch(error){requests.delete(id);reject(error);}});
 events.send=async(method,params={})=>{
  if(method==='Target.sendMessageToTarget'){
   const nested=JSON.parse(params.message);
   // The public runner interface carries an inner request ID. Wire IDs are
   // independent so concurrent root and worker replies cannot collide.
   try{const result=await send(nested.method,nested.params,params.sessionId);events.emit('Target.receivedMessageFromTarget',{sessionId:params.sessionId,message:JSON.stringify({id:nested.id,result})});}
   catch(error){events.emit('Target.receivedMessageFromTarget',{sessionId:params.sessionId,message:JSON.stringify({id:nested.id,error:{message:error.message}})});}return {};
  }
  return send(method,method==='Target.attachToTarget'?{...params,flatten:true}:params);
 };
 events.close=()=>{fail(Error('J4-debug-transport-closed'));socket.close();};
 return events;
}
