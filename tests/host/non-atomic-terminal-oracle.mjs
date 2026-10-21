import assert from 'node:assert/strict';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
export function assertNonAtomicTerminal(result){
 assert.equal(result.scan,'exhausted-observed-non-atomic');assert.equal(result.snapshots.length,2);
 const [first,last]=result.snapshots;assert.equal(first.terminal,false);assert.equal(last.terminal,true);assert.deepEqual(first.windowIds,[A,B]);assert.deepEqual(last.windowIds,[B,C]);
 assert.deepEqual(first.ids,[A,B]);assert.deepEqual(last.ids,[A,B,C]);assert.equal(last.titles[A],'Initial '+A);assert.equal(last.titles[B],'Changed '+B);
 for(const row of result.snapshots){assert.equal(row.snapshotVersion,null);assert.deepEqual(row.batchInventory,{projects:'partial',conversations:'partial',cursor:null});assert(row.inventories.length>0);for(const inv of row.inventories){assert.equal(inv.projects,'partial');assert.equal(inv.conversations,'partial');}}
 assert.equal(result.reopenIdentical,true);assert.deepEqual(result.reopenedIds,[A,B,C]);
}
