import {exactHostRecord} from './contract.mjs';

// Only the private popup can request this explicit action. Page events and
// ordinary context notifications never become retry authority.
export function installLocalReconnect({runtime,reconnect}){
 const listener=(m,sender,reply)=>{
  if(!exactHostRecord(m,['v','type','url'])||m.v!==1||m.type!=='HOST_LOCAL_RECONNECT'||typeof m.url!=='string'||sender?.id!==runtime.id||sender.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  let ok=false;try{ok=reconnect(m.url)===true;}catch{}
  reply({v:1,ok});
 };
 runtime.onMessage.addListener(listener);
 return ()=>runtime.onMessage.removeListener(listener);
}

// Bind a click to the exact document in the popup snapshot; never retarget to
// whatever tab happens to be active when an asynchronous check completes.
export async function requestLocalReconnect({tabs,webNavigation,target}){
 if(!target||!webNavigation)return false;
 let active=true,timer;
 const work=async()=>{
  const rows=await tabs.query({active:true,currentWindow:true});
  if(!active||rows.length!==1||rows[0].id!==target.tabId||rows[0].incognito===true)return false;
  const frame=await webNavigation.getFrame({tabId:target.tabId,frameId:0});
  if(!active||frame?.documentId!==target.documentId||frame.url!==target.url||frame.documentLifecycle!=='active')return false;
  const current=await tabs.query({active:true,currentWindow:true});
  if(!active||current.length!==1||current[0].id!==target.tabId||current[0].incognito===true)return false;
  const reply=await tabs.sendMessage(target.tabId,{v:1,type:'HOST_LOCAL_RECONNECT',url:target.url},{documentId:target.documentId});
  return active&&exactHostRecord(reply,['v','ok'])&&reply.v===1&&reply.ok===true;
 };
 try{return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{active=false;resolve(false);},1000);})]);}
 catch{return false;}finally{active=false;clearTimeout(timer);}
}
