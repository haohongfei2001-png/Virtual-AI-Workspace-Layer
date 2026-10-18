import test from 'node:test';
import assert from 'node:assert/strict';
import {probePeerHistoryOrder,runPeerHistoryOrderMatrix} from './peer-c2-history-order-diagnostic.mjs';
for(const priorReceipt of [false,true])for(const schedule of [{order:'history-first',lookup:'current'},{order:'send-first',lookup:'current'},{order:'send-first',lookup:'old'}]){
 test(`characterize current fail-closed history contract: priorReceipt=${priorReceipt}, ${schedule.order}, lookup=${schedule.lookup}`,async()=>{
  const row=await probePeerHistoryOrder({priorReceipt,...schedule});
  // Characterization, not a desired recovery requirement. An intentional future
  // owner change must replace this expectation with its new safety proof.
  assert.equal(row.newSelectionVerified,priorReceipt||schedule.order==='history-first');
  assert.equal(row.signals.includes('READY'),row.newSelectionVerified);
  assert.equal(row.bodyAssociations,row.newSelectionVerified?1:0);
  assert.equal(row.oldReceiptStillCurrent,false);assert.equal(row.listenersReleased,true);
 });
}
for(const fault of ['history-document','history-target','history-frame','history-lifecycle','second-history','epoch-invalidation','deadline','final-document','final-route','conflicting-context','failed-response','cached-response','stopped-owner']){
 test(`retained warm request cannot authorize after ${fault}`,async()=>{
  const row=await probePeerHistoryOrder({priorReceipt:true,order:'send-first',lookup:'current',fault});
  assert.equal(row.newSelectionVerified,false);assert.equal(row.oldReceiptStillCurrent,false);assert.equal(row.listenersReleased,true);
 });
}
test('diagnostic reports all six cells and never calls itself browser or product acceptance',async()=>{
 const report=await runPeerHistoryOrderMatrix();assert.equal(report.rows.length,6);assert.equal(report.rows.filter(row=>row.newSelectionVerified).length,4);assert.equal(report.acceptance,'NOT_ESTABLISHED');assert.equal(report.ciCause,'NOT_ESTABLISHED');assert.match(report.ownerSourceSha256,/^[0-9a-f]{64}$/);assert(report.rows.every(row=>row.listenersReleased));
});
for(const options of [{priorReceipt:1},{order:'unknown'},{lookup:'other'},{fault:'other'},{order:'history-first',lookup:'old'},...['second-history','epoch-invalidation','conflicting-context'].map(fault=>({order:'history-first',fault}))])test('invalid diagnostic options do not start an owner: '+JSON.stringify(options),async()=>{await assert.rejects(probePeerHistoryOrder(options),/invalid-peer-history-probe/);});
