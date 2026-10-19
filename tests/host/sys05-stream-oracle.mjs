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
export function assertBackpressureOutcome(value){
 assert.equal(value.workInstrumentation,true,'backpressure-observer-required');
 const hold=value.backpressure,sent=value.native.rows.at(-1),packets=value.work.peer.packets;
 assert(hold&&hold.heldAt>=Date.parse(sent.at)&&hold.releasedAt>hold.heldAt&&!hold.closedEarly,'actual-held-authenticated-response-required');
 assert(hold.releasedAt-hold.armedAt<SYS05_LIMITS.rpcMs,'original-total-read-deadline');
 assert.equal(hold.hits,1,'exactly-one-held-read');
 assert(hold.request?.receivedAt>=Date.parse(sent.at)&&hold.request.acceptedAt===Date.parse(sent.at),'held-request-started-after-native-send');
 assert.equal(hold.request.path,'/backend-api/conversation/44444444-4444-4444-8444-444444444444');
 assert.equal(hold.request.context,'account-host-personal');assert.equal(hold.request.authenticated,true);assert.equal(hold.request.status,200);
 assert.equal(value.peerRenameApplied,true,'native-peer-control-applied');
 assert(value.peerRenameAt>=hold.heldAt&&value.peerRenameAt<hold.releasedAt,'native-peer-rename-inside-hold');
 const retries=packets.filter(p=>p.peerRenameTitle&&p.at>=value.peerRenameAt&&p.state==='retry-after'&&p.at>=hold.heldAt&&p.finishedAt<=hold.releasedAt);
 assert(retries.length>0,'actual-peer-backpressure-before-release-required');
 assert(retries.some(r=>r.producer&&/^[a-f0-9]{64}$/.test(r.payloadSha256)&&r.replySeq===r.localSeq&&packets.some(p=>p.peerRenameTitle&&p.kind===r.kind&&p.state==='accepted'&&p.at>=hold.releasedAt&&p.producer===r.producer&&p.localSeq===r.localSeq&&p.replySeq===p.localSeq&&p.payloadSha256===r.payloadSha256&&p.finishedAt-hold.armedAt<SYS05_LIMITS.rpcMs)),'same-producer-sequence-payload-recovery-required');
 assert.equal(value.backpressureNativeActions['sys05-peer-rename'],1,'one-native-peer-rename-required');
 assert.equal(value.peerBefore.team.ref.nativeTitle,'Ordinary conversation');
 assert.equal(value.peerAfter.team.ref.nativeTitle,'SYS05 peer native renamed conversation');
 assert.equal(value.peerAfter.personal.ref.nativeTitle,value.peerBefore.personal.ref.nativeTitle,'peer-title-cross-scope');
 return {backpressureVerdict:'PASS_NARROW_REAL_OWNER_CONTENTION',backpressureAndGapFault:'PARTIAL_BACKPRESSURE_ONLY',queueOverflow:'NOT_RUN',gapRecovery:'NOT_RUN',fullSYS05:'NOT_ESTABLISHED'};
}
export function assertDirectoryGapPrecondition(value){
 const g=value.directoryGap;assert(g&&value.workInstrumentation&&value.directoryGapRequested,'directory-gap-evidence-required');
 assert.equal(g.kind,'ONE_PROPOSAL_NOT_DELIVERED_BEFORE_FORWARD');
 assert.equal(g.expected.length,300);const ids=g.expected.map(e=>e.id),set=new Set(ids);assert.equal(set.size,300);
 const rows=g.faultWork.packets,failed=rows.filter(p=>p.fault==='DROP_BEFORE_FORWARD');assert.equal(failed.length,1);
 const fault=failed[0];assert.equal(fault.forwarded,false);assert.equal(fault.state,'unknown');assert(fault.directoryIds.length>0);
 const accepted=rows.filter(p=>p.forwarded&&p.state==='accepted'&&p.directoryIds.length&&p.finishedAt<=fault.at&&rows.indexOf(p)<rows.indexOf(fault));
 assert(accepted.length>0,'earlier-real-owner-ACK-required');
 assert(accepted.some(p=>p.directoryIds.some(id=>Object.hasOwn(g.afterFault.refTitles,id))),'earlier-ACK-must-be-persistent');
 assert(fault.directoryIds.some(id=>!Object.hasOwn(g.afterFault.refTitles,id)),'designated-undelivered-ID-must-be-missing');
 const emitted=new Set(rows.flatMap(p=>p.directoryIds));assert(ids.some(id=>!emitted.has(id)&&!Object.hasOwn(g.afterFault.refTitles,id)),'never-emitted-tail-gap-required');
 return {fault};
}
export function assertDirectoryGapOutcome(value){
 const {fault}=assertDirectoryGapPrecondition(value),g=value.directoryGap,ids=g.expected.map(e=>e.id),set=new Set(ids),failed=g.faultWork.packets.filter(p=>p.fault==='DROP_BEFORE_FORWARD');
 assert(Array.isArray(g.work.renewals),'renewal-trace-required');
 assert(!g.work.renewals.some(r=>r.at<=g.completedAt&&(r.finishedAt===null||r.finishedAt>=fault.at)),'renewal-must-not-masquerade-as-return-rescan');
 assert(g.actionAt>fault.finishedAt&&g.completedAt>=g.actionAt&&g.elapsedMs<6000,'bounded-return-rescan-required');
 assert(g.work.packets.some(p=>p.at>=g.actionAt&&p.forwarded&&p.state==='accepted'&&p.directoryIds.some(id=>fault.directoryIds.includes(id))),'fresh-real-owner-recovery-required');
 assert(g.afterFault.inventories.some(i=>i?.conversations==='partial'),'explicit-partial-inventory-required');
 for(const inventory of g.afterFault.inventories)assert.notEqual(inventory?.conversations,'complete','gap-cannot-claim-complete');
 assert.equal(g.work.gap.dropped,1);assert.equal(g.work.counters.unknown,1);assert.equal(g.work.counters.traceDropped,0);assert.equal(g.work.counters.observerErrors,0);
 assert.deepEqual(g.work.packets.filter(p=>p.state==='unknown').map(p=>[p.producer,p.kind,p.localSeq,p.payloadSha256,p.fault]),failed.map(p=>[p.producer,p.kind,p.localSeq,p.payloadSha256,p.fault]),'only-designated-error-permitted');
 assert(g.work.packets.every(p=>!['pending','rejected'].includes(p.state)),'unexpected-transport-result');
 assert.deepEqual(g.after.refIds,[...g.before.refIds,...ids].sort(),'exact-complete-inventory-required');
 for(const item of g.expected)assert.equal(g.after.refTitles[item.id],item.title,'native-title-mismatch');
 for(const id of g.before.refIds)assert.equal(g.after.refTitles[id],g.before.refTitles[id],'existing-native-fact-changed');
 assert.deepEqual(g.after.hints,g.before.hints,'original-ACK-identity-or-time-changed');
 assert.deepEqual(g.after.projectIds,g.before.projectIds);assert(g.peer.refIds.every(id=>!set.has(id)),'directory-cross-scope');
 assert.equal(g.actions['sys05-load-directory'],1);assert.equal(g.actions['send-intent'],1);assert.equal(g.draftPreserved,true);assert.equal(g.uniqueReturn,true);
 const tail=g.expected.at(-1);assert.equal(g.tail.topLevelOpen,true,'tail-search-parent-must-be-open');assert.equal(g.tail.id,tail.id);assert.equal(g.tail.title,tail.title);assert.equal(new URL(g.tail.href).pathname,'/c/'+tail.id);
 return {gapRecovery:'PASS_NARROW_UNDELIVERED_FRAGMENT_RETURN_RESCAN',queueOverflow:'NOT_RUN',fullSYS05:'NOT_ESTABLISHED'};
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
 assert.equal(value.presentation?.topLevelOpen,true,'workspace-parent-must-be-open');assert(value.presentation.tokenTicks>=8,'workspace-must-remain-visible-through-token-updates');
 assert.equal(ui.exactTitle,true,'native-title-not-visible-in-real-UI');
 if(!value.workInstrumentation)assert(ui.evidenceToVisibleTitleMs>=0&&ui.evidenceToVisibleTitleMs<SYS05_LIMITS.evidenceToUiMs,'original-F1-evidence-to-UI-1000ms');
 assert(personal.refIds.length>0&&personal.projectIds.length>0,'unsupported-profile-is-not-a-pass');
 for(const budget of [personal.budget,team.budget]){assert(budget,'real-persistent-read-budget-required');assert(budget.checksumValid);assert(budget.requests<=SYS05_LIMITS.requestsPerWindow);assert(budget.attemptCounts.every(n=>n<=SYS05_LIMITS.attempts));}
 if(value.directoryGapRequested)assertDirectoryGapOutcome(value);
 if(value.workInstrumentation){for(const page of [work.active,work.peer]){const c=page.counters;assert.equal(c.traceDropped,0,'packet-counter-truncated');assert.equal(c.observerErrors,0,'observer-error');assert.equal(c.unknown,value.directoryGapRequested&&page===work.active?1:0,'unresolved-observation-result');assert(c.maxBytes<=SYS05_LIMITS.packetBytes);assert(c.maxCandidates<=SYS05_LIMITS.candidatesPerPacket);assert(c.maxMessageIds<=SYS05_LIMITS.messageIdsPerPacket);assert(page.packets.every(p=>p.state!=='pending'),'unfinished-observation');}
 assert(work.active.counters.accepted>0,'real-owner-acceptance-required');
 assert(work.active.packets.some(p=>p.kind==='current-observation'&&p.jointTitle&&p.messageIds>=3&&p.state==='accepted'),'accepted-joint-body-title-packet-required');
 }
 return {status:value.workInstrumentation?'PASS_NARROW_DIAGNOSTIC_SYS05_SLICE':'PASS_NARROW_OFFLINE_SYS05_CORRECTNESS',F1:value.workInstrumentation?'DIAGNOSTIC_ONLY_NOT_ACCEPTED':'PASS_CONSERVATIVE_SINGLE_SAMPLE_NOT_P95',localDirty:value.workInstrumentation?'TOKEN_ONLY_WINDOW_OBSERVED':'NOT_RUN',affectedPageWork:value.workInstrumentation?'TOKEN_ONLY_WINDOW_OBSERVED':'NOT_RUN',fullSYS05:'NOT_ESTABLISHED',membership:'OBSERVED_ONLY',p95:'NOT_RUN',backpressureAndGapFault:'NOT_RUN'};
}
