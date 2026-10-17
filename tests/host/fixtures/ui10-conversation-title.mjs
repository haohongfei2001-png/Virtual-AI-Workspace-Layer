/** Fixture-owned data opt-in, never an authority/receipt or extension projection. */
export function applyUi10ConversationTitle({profile,journey,variant,title,conversations}){
 if(title===null)return;
 if(!['MODERN','PARTIAL'].includes(profile)||journey!==null||variant!=='positive'||typeof title!=='string'||!title.trim()||title.length>200)throw Error('invalid-ui10-fixture-title');
 const id=profile==='PARTIAL'?'77777777-7777-4777-8777-000000000001':'33333333-3333-4333-8333-333333333333';
 const conversation=conversations.get(id);if(!conversation)throw Error('missing-ui10-fixture-conversation');
 conversation.title=title;
}
