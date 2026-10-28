import assert from 'node:assert/strict';
// Current members may be bare rows or wrapped by the production workset action.
// Do not select arbitrary descendants: expanded .old-list rows must stay separate.
export const UI10_CURRENT_MEMBER_ROWS='.card .members > .row, .card .members > .working-set-row > .row';
export function assertUi10CurrentMemberIds(ids,count,allowed){assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert(ids.every(id=>allowed.includes(id)),'non-current member leaked into current rows');return true;}

/** The populated journey actually opens every fixture row. Its original send
 * dates stay intact, but each current row must also have a separately admitted
 * local-use witness. Never infer a current activity date from the visit log. */
export function assertUi10LocalUses(evidence,rows,{scopeKey,startedAt,now}){
 assert.equal(evidence.scopeKey,scopeKey);assert(Number.isFinite(startedAt)&&Number.isFinite(now)&&now>=startedAt);
 const seen=new Set();
 for(const row of rows){
  assert(!seen.has(row.id));seen.add(row.id);
  const hints=Object.values(evidence.hints??{}).filter(h=>h.conversationId===row.id&&h.hintType==='local-recent-use');
  assert.equal(hints.length,1,'one admitted local use per opened fixture row');
  const h=hints[0],s=evidence.sources[h.sourceId],used=Date.parse(h.usedAt),observed=Date.parse(h.observedAt);
  assert(s&&s.channel==='host-evidence'&&s.codecVersion===3&&s.profileId==='vaiwl-local-use'&&!s.revoked&&!h.revoked);
  assert.equal(s.generation,h.generation);assert(h.sourceRevision<=s.sourceRevision);
  assert(used>=startedAt&&used<=observed&&observed<=now&&observed<=Date.parse(s.observedAt),'local use must belong to this actual journey');
  assert.equal(h.sentAt,undefined);assert.equal(h.actorVerified,undefined);assert.equal(h.sentInterval,undefined);
 }
 return {project:rows.filter(r=>r.project).map(r=>r.id),noProject:rows.filter(r=>r.project===null).map(r=>r.id)};
}
