import assert from 'node:assert/strict';
export const SYS05_LIMITS=Object.freeze({evidenceToUiMs:1000,rpcMs:6000,readWindowMs:30000,requestsPerWindow:12,attempts:3,packetBytes:65536,candidatesPerPacket:256,messageIdsPerPacket:256});
export function counterDelta(before,after){return Object.fromEntries(Object.entries(after.counters).map(([key,value])=>[key,value-(before.counters[key]??0)]));}
export function assertTokenOnlyWork({active,peer}){
 assert(active.bodyQueries>0,'real-current-body-scans-required');
 assert.equal(active.directoryVisits,0,'token-only-directory-rescan');
 assert.equal(active.directoryWalkers,0,'token-only-directory-walker');
 assert.equal(peer.directoryVisits,0,'unrelated-page-directory-work');
 assert.equal(peer.directoryWalkers,0,'unrelated-page-directory-walker');
 assert.equal(peer.bodyQueries,0,'unrelated-page-body-work');
}
export function assertStreamOutcome(value){
 const {native,stream,personal,team,ui,work}=value,sent=native.rows.at(-1);
 assert.equal(native.accepts,1,'one-native-send-only');
 assert.equal(sent.author,'user-host-fixture');
 assert.equal(native.title,'J4 native jointly renamed conversation');
 assert(stream.realDescendant&&stream.sameReading&&stream.jointBatch,'real-same-batch-token-title-ACK-DOM-required');
 assert(stream.jointAt>=stream.startedAt&&stream.jointAt<stream.finishedAt,'joint-operation-inside-live-stream');
 assert.equal(stream.ticks,800,'finite-stream-incomplete');
 assert.equal(stream.mutations,6400,'token-loss');
 assert.equal(stream.running,false);
 assert(stream.tokensAtDurable>stream.jointToken&&stream.tokensAtVisibleTitle>stream.tokensAtDurable,'stream-stalled-across-ACK-or-title');
 assert.equal(personal.ref?.nativeTitle,native.title,'native-title-not-durable');
 const hints=personal.hints.filter(h=>h.messageId===sent.id);assert.equal(hints.length,1,'one-original-ACK-required');
 assert.equal(hints[0].conversationId,'44444444-4444-4444-8444-444444444444');
 assert(hints[0].firstObservedAt&&hints[0].hasAckWitness&&!hints[0].hasSentAt,'original-provisional-ACK-required');
 assert.equal(team.hints.filter(h=>h.messageId===sent.id).length,0,'cross-scope-ACK');
 assert.equal(team.ref?.nativeTitle,'Membership not loaded','cross-scope-title');
 assert(value.before?.personal?.activity?.basis==='provisional'&&value.before.personal.activity.reason==='historical-anchor-incomplete'&&value.before.personal.activity.segment>0,'real-old-activity-prestate-required');
 const old=value.before.personal.originalOldEvent;assert(old?.messageId==='j4_original_old'&&old.precision==='millisecond'&&old.actorVerified===true&&Date.parse(old.sentAt)<Date.parse(hints[0].firstObservedAt)-89*86400000,'real-exact-old-event-required');
 assert.equal(value.beforeUI?.recentCurrentRows,0,'recent-row-must-not-preexist');
 assert(personal.activity?.basis==='provisional'&&personal.activity.reason==='observed-self-send'&&personal.activity.segment===0,'ACK-specific-recent-activity-required');
 assert.equal(ui.currentRef,'44444444-4444-4444-8444-444444444444');
 assert.equal(ui.activityPlacement,'RECENT_LIST_ABSENT_TO_VISIBLE_NOT_CURRENT_CONTEXT');
 assert.equal(ui.exactTitle,true,'native-title-not-visible-in-real-UI');
 if(!value.workInstrumentation)assert(ui.evidenceToVisibleTitleMs>=0&&ui.evidenceToVisibleTitleMs<SYS05_LIMITS.evidenceToUiMs,'original-F1-evidence-to-UI-1000ms');
 assert(personal.refIds.length>0&&personal.projectIds.length>0,'unsupported-profile-is-not-a-pass');
 for(const budget of [personal.budget,team.budget]){assert(budget,'real-persistent-read-budget-required');assert(budget.checksumValid);assert(budget.requests<=SYS05_LIMITS.requestsPerWindow);assert(budget.attemptCounts.every(n=>n<=SYS05_LIMITS.attempts));}
 if(value.workInstrumentation){for(const page of [work.active,work.peer]){const c=page.counters;assert.equal(c.traceDropped,0,'packet-counter-truncated');assert.equal(c.observerErrors,0,'observer-error');assert.equal(c.unknown,0,'unresolved-observation-result');assert(c.maxBytes<=SYS05_LIMITS.packetBytes);assert(c.maxCandidates<=SYS05_LIMITS.candidatesPerPacket);assert(c.maxMessageIds<=SYS05_LIMITS.messageIdsPerPacket);assert(page.packets.every(p=>p.state!=='pending'),'unfinished-observation');}
 assert(work.active.counters.accepted>0,'real-owner-acceptance-required');
 assert(work.active.packets.some(p=>p.kind==='current-observation'&&p.jointTitle&&p.messageIds>=3&&p.state==='accepted'),'accepted-joint-body-title-packet-required');
 }
 return {status:value.workInstrumentation?'PASS_NARROW_DIAGNOSTIC_SYS05_SLICE':'PASS_NARROW_OFFLINE_SYS05_CORRECTNESS',F1:value.workInstrumentation?'DIAGNOSTIC_ONLY_NOT_ACCEPTED':'PASS_CONSERVATIVE_SINGLE_SAMPLE_NOT_P95',localDirty:value.workInstrumentation?'TOKEN_ONLY_WINDOW_OBSERVED':'NOT_RUN',affectedPageWork:value.workInstrumentation?'TOKEN_ONLY_WINDOW_OBSERVED':'NOT_RUN',fullSYS05:'NOT_ESTABLISHED',membership:'OBSERVED_ONLY',p95:'NOT_RUN',backpressureAndGapFault:'NOT_RUN'};
}
