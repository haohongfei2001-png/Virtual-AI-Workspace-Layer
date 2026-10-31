import assert from 'node:assert/strict';
export const ORDER_PROJECT='g-p-11111111111111111111111111111111';
export const ORDER_CONVERSATION='33333333-3333-4333-8333-333333333333';
export function assertMixedRole(r){
 assert.equal(r.dom.blocks,1);assert.deepEqual(r.dom.ids,['order_user','order_assistant','order_neighbor','order_missing']);assert.deepEqual(r.dom.roles,['user','assistant','user','user']);assert(['data-message-author-role','data-role'].includes(r.dom.roleAttribute));
 const events=r.facts.events.filter(e=>e.conversationId===ORDER_CONVERSATION);assert.equal(events.length,1);assert.equal(events[0].messageId,'order_user');assert.equal(events[0].role,'user');assert.equal(events[0].actorVerified,true);assert.equal(events[0].sentAt,r.expectedUserTime);
 const decision=r.facts.refs.find(x=>x.id===ORDER_CONVERSATION)?.activity;assert(decision);assert.equal(decision.segment,1);assert.equal(decision.candidateTime,r.expectedUserTime);assert.equal(r.facts.hints.length,0);assert.equal(r.nativeSends,0);
}
export function assertMembershipOrder(r){
 assert.equal(r.nativeAccepts,1);assert.equal(r.nativeSubmits,1);assert.equal(r.beforeLinkVisible,true);assert.equal(r.afterLinkVisible,true);assert.equal(r.returnedConversation,true);
 const id=r.conversationId,message=r.messageId,b=r.before.refs.find(x=>x.id===id),a=r.after.refs.find(x=>x.id===id);assert(b&&a);assert.equal(b.membership,'UNKNOWN');assert.equal(b.projectId,null);assert.equal(b.activity.reason,'observed-self-send');assert.equal(b.activity.segment,0);
 assert(r.before.projects.length>0);assert(r.before.projects.every(p=>!p.members.includes(id)&&p.activity.candidateTime===null));
 assert.equal(a.membership,'PROJECT');assert.equal(a.projectId,ORDER_PROJECT);const p=r.after.projects.find(x=>x.id===ORDER_PROJECT);assert(p?.members.includes(id));assert.equal(p.activity.candidateTime,a.activity.candidateTime);assert.equal(p.activity.segment,0);
 for(const facts of [r.before,r.after]){const hints=facts.hints.filter(h=>h.conversationId===id);assert.equal(hints.length,1);assert.equal(hints[0].messageId,message);assert.equal(hints[0].actorVerified,true);assert.equal(hints[0].hintType,'observed-self-send');assert.equal(hints[0].ackWitness.kind,'authenticated-message-readback');assert.equal('sentAt' in hints[0],false);}
 assert.deepEqual(r.after.hints,r.before.hints);assert.deepEqual(r.after.refs.filter(x=>x.id===id).map(x=>x.activity),r.before.refs.filter(x=>x.id===id).map(x=>x.activity));
}
