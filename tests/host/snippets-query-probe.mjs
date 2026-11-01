/** Offline-runner metadata only. This does not change a response, DOM, focus,
 * input, authority or deadline. It reads only the named owned search/control. */
export function installSnippetsQueryProbe({role}){
 if(!['workspace','sidebar','host'].includes(role)||globalThis.__vaiwlSnippetQueryProbe)throw Error('invalid-snippet-query-probe');
 const text=value=>typeof value==='string'?value.slice(0,200):null;
 const number=value=>Number.isSafeInteger(value)?value:null;
 const at=()=>performance.timeOrigin+performance.now();
 const search=value=>value?{query:text(value.query),projectId:text(value.projectId),offset:number(value.offset),limit:number(value.limit)}:null;
 const query=value=>value?{segment:number(value.segment),offset:number(value.offset),limit:number(value.limit),search:search(value.search)}:null;
 const presentation=value=>value?{revision:number(value.revision),kind:text(value.intent?.kind),theme:text(value.intent?.themeId)}:null;
 const ids=new WeakMap();let nextId=0,lastViewRequest=null,lastViewReply=null,events=0,transport=0;
 const id=node=>{if(!node)return null;if(!ids.has(node))ids.set(node,++nextId);return ids.get(node);};
 const currentInput=()=>role==='workspace'?document.querySelector('[data-vaiwl-frame-role="workspace"]')?.shadowRoot?.querySelector('input[aria-label="已知聊天查找输入"][data-focus-key="search-input"]')??null:null;
 const label=node=>{
  if(!node?.getAttribute)return null;
  const name=node.getAttribute('aria-label');
  if(role==='host')return node.tagName==='BUTTON'&&node.hasAttribute('data-va-owned')&&name==='返回工作空间'?name:null;
  if(node.tagName==='INPUT'&&name==='已知聊天查找输入'&&node.getAttribute('data-focus-key')==='search-input')return name;
  return node.tagName==='BUTTON'&&['返回工作空间','定位片段'].includes(name)?name:null;
 };
 const describe=node=>{
  const name=label(node);if(!name)return null;
  return {node:id(node),label:name,connected:node.isConnected===true,currentInput:node===currentInput(),focused:node.getRootNode().activeElement===node,value:name==='已知聊天查找输入'?text(node.value):null};
 };
 const record=event=>{
  const target=event.composedPath().slice(0,12).find(node=>label(node)!==null),keyboard=['keydown','keyup'].includes(event.type),input=keyboard?currentInput():null;if(!target&&!input)return;
  events++;console.log('SNIPPET_INPUT_TRACE '+JSON.stringify({role,at:at(),type:event.type,isTrusted:event.isTrusted===true,inputType:text(event.inputType),target:describe(target),...(keyboard?{key:text(event.key),code:text(event.code),documentHasFocus:document.hasFocus(),currentInput:describe(input)}:{})}));
 };
 const types=['input','beforeinput','focusin','focusout','blur','click','keydown','keyup'];
 for(const type of types)document.addEventListener(type,record,{capture:true,passive:true});
 const runtime=role==='host'?null:chrome.runtime,originalSend=runtime?.sendMessage;
 const wrapped=runtime?async function(message){
  const requestedAt=at(),requestQuery=query(message.query);
  if(message.type==='HOST_UI_VIEW')lastViewRequest={at:requestedAt,query:requestQuery};
  const result=await originalSend.call(runtime,message);
  const row={role,at:at(),requestedAt,type:text(message.type),action:text(message.action),ok:typeof result?.ok==='boolean'?result.ok:null,state:text(result?.state),reason:text(result?.reason),requestQuery,readySearch:result?.ok===true&&result.state==='ready'?search(result.page?.search):null,pagePresentation:presentation(result?.page?.presentation),presentation:presentation(result?.presentation),clearProjection:typeof result?.clearProjection==='boolean'?result.clearProjection:null};
  if(message.type==='HOST_UI_VIEW')lastViewReply=row;
  transport++;console.log('SNIPPET_PUBLIC_TRACE '+JSON.stringify(row));return result;
 }:null;
 if(runtime)runtime.sendMessage=wrapped;
 globalThis.__vaiwlSnippetQueryProbe={
  snapshot(phase,target=null){const input=currentInput();return {phase:text(phase),role,at:at(),target:describe(target),input:describe(input),lastViewRequest,lastViewReply};},
  finish(){for(const type of types)document.removeEventListener(type,record,true);if(runtime?.sendMessage===wrapped)runtime.sendMessage=originalSend;delete globalThis.__vaiwlSnippetQueryProbe;return {role,events,transport};}
 };
}

/** Keep the latest 256 per channel. Total sequence numbers, not array indexes,
 * associate a later locate receipt even if an earlier diagnostic was dropped. */
export function recordSnippetsProbeConsole(report,text){
 const channels=[['SNIPPET_PUBLIC_TRACE ','transport'],['SNIPPET_INPUT_TRACE ','inputEvents']];
 for(const [prefix,key]of channels){
  if(!text.startsWith(prefix))continue;
  let row;try{row=JSON.parse(text.slice(prefix.length));}catch{return false;}
  if(!row||typeof row!=='object'||Array.isArray(row))return false;
  const sequence=key+'Sequence',dropped=key+'Dropped';report[sequence]=(report[sequence]??0)+1;
  const list=report[key]??=[];if(list.length>=256){list.shift();report[dropped]=(report[dropped]??0)+1;}
  list.push({...row,sequence:report[sequence]});return true;
 }
 return false;
}
