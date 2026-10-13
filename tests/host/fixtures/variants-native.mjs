// Native application reconstruction for current/partial layouts, not a test oracle.
import '/native.mjs';
const preferences = await (await fetch('/native/preferences')).json();
const historyRegion = document.querySelector('aside nav[aria-label="Chat history"]');
let offset = historyRegion.querySelectorAll('a[href]').length,loading=false;
historyRegion.addEventListener('scroll',async()=>{
 if(loading || historyRegion.scrollTop+historyRegion.clientHeight<historyRegion.scrollHeight-4)return;
 loading=true;
 try{
  const response=await fetch(`/backend-api/conversations?offset=${offset}&limit=25`,{headers:{'Chatgpt-Account-Id':preferences.account_id}});
  if(!response.ok)return;
  const data=await response.json();if(!Array.isArray(data.items))return;
  if(data.windowed) historyRegion.querySelectorAll('a').forEach(node=>node.remove());
  for(const item of data.items){const a=document.createElement('a');a.href=`/c/${item.id}`;a.textContent=item.title??'Untitled';historyRegion.append(a);}
  offset=data.next_offset;
 }finally{loading=false;}
});
let lastConversation=null;
async function loadCurrentMessages(){
 const match=/^\/c\/([^/]+)$/.exec(location.pathname);if(!match){lastConversation=null;return;}if(match[1]===lastConversation)return;
 lastConversation=match[1];
 const response=await fetch(`/backend-api/conversation/${encodeURIComponent(match[1])}`,{headers:{'Chatgpt-Account-Id':preferences.account_id}});
 if(!response.ok)return;
 let data;try{data=await response.json();}catch{return;}
 // A late native response must not rewrite a later native view either.
 if(location.pathname!==`/c/${match[1]}` || !data.mapping)return;
 const reading=document.querySelector('#reading');
 const fragment=document.createDocumentFragment();
 for(const node of Object.values(data.mapping)){
  if(!node.message)continue;
  const article=document.createElement('article');article.dataset.messageId=node.message.id;
  if(node.message.author?.role)article.dataset.messageAuthorRole=node.message.author.role;
  if(node.message.author?.id)article.dataset.authorId=node.message.author.id;
  const body=document.createElement('div');body.dataset.messageId=node.message.id;body.textContent='Offline native message';article.append(body);
  if(typeof node.message.create_time==='number'){const time=document.createElement('time');time.dateTime=new Date(node.message.create_time*1000).toISOString();article.append(time);}
  fragment.append(article);
 }
 reading.append(fragment);
}
new MutationObserver(()=>void loadCurrentMessages()).observe(document.querySelector('h1'),{childList:true,subtree:true});
await loadCurrentMessages();
