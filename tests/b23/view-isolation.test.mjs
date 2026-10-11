/** Corrupt view state must not make intact human Workspace assets inaccessible.
 * This suite uses the labelled mock backend, not native IndexedDB evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from './mock-idb.mjs';
import { harness, A } from './contracts.mjs';
import { FIXTURE_NOW } from '../../simulator/data.mjs';
import { digest } from '../../src/data/hash.mjs';
const view={segment:2,oldOpen:[],sidebarOpen:[],capacities:[],scroll:150,sidebarVisible:true};
async function corruptView(h, validChecksum=false) {
  await h.repo.saveView(A,view,0);
  const db=await h.base.open();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('b23_views','readwrite'),s=tx.objectStore('b23_views'),r=s.get(h.base.scopeOrThrow(A).key);
    r.onsuccess=()=>{const row=r.result;if(validChecksum){row.payload.value.segment=-1;row.checksum=digest(row.payload);}else row.checksum='invalid';s.put(row);};
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
for(const validChecksum of [false,true])test('VIEW_ISOLATION '+(validChecksum?'invalid-schema':'invalid-checksum')+' preserves intact assets and reports view corruption',async()=>{
  const h=await harness(new MockIDBFactory());
  try {
    await h.command({type:'SET_TITLE',refId:'T0',title:'intact-human-title'});
    await corruptView(h,validChecksum);
    const data=await h.repo.snapshot(A,FIXTURE_NOW,'UTC');
    assert.equal(data.refs.find(r=>r.id==='T0').displayTitle,'intact-human-title');
    assert.equal(data.view,null);assert.equal(data.diagnostics.view,'CORRUPT_VIEW');
    assert.equal(data.refs.length,604);assert.equal(data.groups.length,120);
    const current=(await h.repo.read(A)).state.revision;
    assert((await h.repo.command(A,{operationId:'after_view_corrupt',expectedRevision:current,command:{type:'SET_TITLE',refId:'T1',title:'still-editable'}})).ok);
    // The damaged preference record is preserved, not silently overwritten.
    assert.equal((await h.repo.saveView(A,view,0)).ok,false);
  } finally {h.close();}
});
