const states=new Set(['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','unavailable']);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
/** Passive isolated-world status. This is not an authority or recovery channel. */
export function installLocalStatus({runtime,readState}){
 const listener=(message,sender,reply)=>{
  if(!exact(message,['v','type'])||message.v!==1||message.type!=='HOST_LOCAL_STATUS'||sender?.id!==runtime.id||sender?.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  let state='unavailable';try{const value=readState();if(states.has(value))state=value;}catch{}
  reply({v:1,state});
 };
 runtime.onMessage.addListener(listener);
 return ()=>runtime.onMessage.removeListener(listener);
}
/** One local query; no URL/title reads, permissions, authentication or retry. */
export function readActiveLocalStatus({tabs,schedule=setTimeout,cancel=clearTimeout}){
 return new Promise(resolve=>{
  let settled=false,timer;const finish=value=>{if(settled)return;settled=true;cancel(timer);resolve(value);};
  timer=schedule(()=>finish('unavailable'),1000);
  Promise.resolve().then(()=>tabs.query({active:true,currentWindow:true})).then(rows=>{
   if(settled)return;
   if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0){finish('unavailable');return;}
   return tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_STATUS'},{frameId:0});
  }).then(value=>{if(settled)return;finish(exact(value,['v','state'])&&value.v===1&&states.has(value.state)?value.state:'unavailable');},()=>finish('unavailable'));
 });
}
