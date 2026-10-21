import {randomUUID} from 'node:crypto';
/** Independent native fixture state. No extension receipt or runtime message API. */
export function createFirstSendFixture({principal,accounts,conversations,detailAppends,detailAcceptances,unknownMembership=false}){
 if(typeof unknownMembership!=='boolean')throw Error('invalid-first-send-membership-option');
 const operations=new Map();
 return {assignProject(projectId){if(!unknownMembership||operations.size!==1)throw Error('first-send-membership-requires-one-new-send');const row=[...operations.values()][0];conversations.get(row.conversationId).project=projectId;return {conversationId:row.conversationId,projectId};},snapshot:()=>structuredClone([...operations.values()]),view(conversationId){const row=[...operations.values()].find(r=>r.conversationId===conversationId);return row?{messages:[{messageId:row.messageId,branchId:'first-send-root',text:'Native first message accepted.'}]}:{};},handle(req,res,url,json){
  if(url.pathname==='/native/first-send'&&req.method==='POST'){
   const operationId=req.headers['x-native-operation-id'],messageId=req.headers['x-native-message-id'];
   if(![operationId,messageId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v))||operations.has(operationId)||[...operations.values()].some(v=>v.messageId===messageId)||accounts().length!==1){json(res,409,{error:'ambiguous-first-send'});return true;}
   const conversationId=randomUUID(),row={operationId,messageId,conversationId,acceptanceState:'accepted',principalId:principal(),contextId:accounts()[0].account_id};
   operations.set(operationId,row);conversations.set(conversationId,{id:conversationId,title:'First send conversation',...(unknownMembership?{}:{project:null})});detailAppends.set(conversationId,[messageId]);detailAcceptances.set(conversationId,new Set([messageId]));json(res,200,{href:'/c/'+conversationId});return true;
  }
  const match=/^\/native\/first-send\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
  if(match&&req.method==='GET'){const row=operations.get(match[1]);if(!row||row.principalId!==principal()||!accounts().some(a=>a.account_id===row.contextId)||url.search)json(res,404,{error:'missing-first-send'});else json(res,200,row);return true;}return false;
 }};
}
export function firstSendNative(source){
 const original="$('#composer').onsubmit = async (event) => { event.preventDefault(); if(event.isComposing) return; await action('send-intent'); $('#composer output').textContent = 'Offline reconstruction: message not sent'; };";
 if(!source.includes(original))throw Error('first-send-native-handler-changed');
 return source.replace(original,`
function prepareFirstSend(){const form=$('#composer');form.dataset.nativeOperationId=crypto.randomUUID();form.dataset.nativeMessageId=crypto.randomUUID();}
prepareFirstSend();
$('#composer').onsubmit=async event=>{
 event.preventDefault();if(event.isComposing||location.pathname!=='/')return;
 const form=$('#composer'),button=form.querySelector('button[type="submit"]'),operationId=form.dataset.nativeOperationId,messageId=form.dataset.nativeMessageId;
 button.disabled=true;
 try{await action('send-intent');const response=await fetch('/native/first-send',{method:'POST',headers:{'x-native-operation-id':operationId,'x-native-message-id':messageId}});if(!response.ok)throw Error('Native first send failed');const result=await response.json();$('#prompt-textarea').value='';await navigate(result.href);}finally{button.disabled=false;prepareFirstSend();}
};`);
}
