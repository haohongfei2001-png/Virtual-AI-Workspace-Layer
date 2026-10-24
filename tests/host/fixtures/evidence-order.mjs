/** Offline application reconstruction, not observed live source semantics. No expected-world import. */
export function validateEvidenceScenario(scenario,profile,journey){
 if(![null,'mixed-role','mixed-role-alt','membership-after-message'].includes(scenario)||scenario!==null&&(profile!=='LEGACY'||journey!==(scenario==='membership-after-message'?'FIRST_SEND':'J3')))throw Error('invalid-evidence-order-scenario');
}
export function mixedRoleRecords(conversationId,principalId,now){
 const old=new Date(now-45*86400000).toISOString().replace(/\.\d{3}Z$/,'Z'),recent=new Date(now-86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
 const rows=[['order_user','user',principalId,old],['order_assistant','assistant',principalId,recent],['order_neighbor','user','other-fixture-person',recent],['order_missing','user',null,recent]];
 return rows.map(([id,role,author,time])=>({id,role,author,time,conversationId}));
}
export function mixedRoleDetail(conversationId,principalId,now){
 return {conversation_id:conversationId,history_semantics:'fixture-original-self-send/1',mapping:Object.fromEntries(mixedRoleRecords(conversationId,principalId,now).map((r,i)=>['order_node_'+i,{id:'order_node_'+i,parent:i?'order_node_'+(i-1):null,message:{id:r.id,author:{role:r.role,...(r.author?{id:r.author}:{})},create_time:Math.floor(Date.parse(r.time)/1000),original_send:{author_id:r.author,conversation_id:conversationId,kind:'new-send',state:'committed',precision:'second',sent_at:r.time},content:{parts:['Offline mixed-role body']}}}]))};
}
export function mixedRoleView(conversationId,principalId,now){return {messages:mixedRoleRecords(conversationId,principalId,now).map(r=>({messageId:r.id,role:r.role,time:r.time,text:'Offline '+r.role+' message'}))};}
export function mixedRoleNative(source,scenario){
 const needle="else if(Array.isArray(view.messages)){for(const item of view.messages){const article=document.createElement('article');article.dataset.messageId=item.messageId;article.dataset.branchId=item.branchId;const body=document.createElement('div');body.className='message-body';body.textContent=item.text;article.append(body);reading.append(article);}}";
 if(source.split(needle).length!==2)throw Error('mixed-role-native-render-anchor');
 const attribute=scenario==='mixed-role'?'data-message-author-role':'data-role';
 return source.replace(needle,`else if(Array.isArray(view.messages)){const block=document.createElement('article');block.dataset.mixedRoleBlock='true';for(const item of view.messages){const message=document.createElement('div');message.dataset.messageId=item.messageId;message.setAttribute('${attribute}',item.role);const body=document.createElement('span');body.textContent=item.text;const time=document.createElement('time');time.dateTime=item.time;message.append(body,time);block.append(message);}reading.append(block);}`);
}
