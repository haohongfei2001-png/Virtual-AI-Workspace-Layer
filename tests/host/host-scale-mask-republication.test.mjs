/** Current behavior characterization only: real adapter/discovery/surfaceBatch
 * with inherited-visibility DOM doubles and Map accumulation. This is not a
 * NativeRepository/IndexedDB reducer regression, browser, performance or fix claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runMemberVisibilityProbe} from './fixtures/host-scale-member-mask-double.mjs';

const summarize=packets=>({packets:packets.length,candidates:packets.reduce((n,p)=>n+(p.payload.candidates?.length??0),0),claims:packets.reduce((n,p)=>n+(p.payload.membershipClaims?.length??0),0),detached:packets.reduce((n,p)=>n+(p.payload.detachedHandles?.length??0),0)});
async function maskedAfterComplete(t){
 const f=await runMemberVisibilityProbe({});t.after(()=>f.stop());
 const original=f.admitted(),before=f.packets.length;
 assert.equal(f.facts().refs,1000);assert.equal(f.facts().membership,1000);assert.equal(f.facts().wrongMembership,0);
 await f.rescan(true);
 const repeated=f.packets.slice(before),summary=summarize(repeated);
 assert(repeated.length>0,'opening mask currently causes one finite republication pass');
 assert(repeated.every(p=>p.kind==='surface-delta'&&p.payload.candidates.length<=256&&p.payload.membershipClaims.length<=256&&p.payload.detachedHandles.length<=512));
 assert.equal(summary.detached,0,'republication does not require a detached handle');
 assert.equal(f.facts().events.at(-1),'end','the masked pass has a finite end');
 assert.deepEqual(f.admitted().membership,original.membership,'surfaceBatch/Map probe retains prior PROJECT entries when masked proposals provide no replacement' );
 assert.deepEqual(new Set(f.admitted().refs),new Set(original.refs));
 assert.equal(f.facts().membership,1000);assert.equal(f.facts().wrongMembership,0);
 t.diagnostic(JSON.stringify({evidence:'L_DOM_DOUBLE_CHARACTERIZATION_NOT_A_FIX',visiblePackets:before,maskRepublication:summary,projectMembership:f.facts().membership}));
 return f;
}
test('complete visible 1000 to owned mask has finite semantic republication without PROJECT downgrade',async t=>{
 await maskedAfterComplete(t);
});
test('a second unchanged masked scan drains without another publication',async t=>{
 const f=await maskedAfterComplete(t),before=f.packets.length;
 await f.rescan(true);assert.equal(f.packets.length,before);assert.equal(f.facts().events.at(-1),'end');assert.equal(f.facts().membership,1000);
});
test('intervening candidate-only scan does not republish the unchanged masked directory',async t=>{
 const f=await maskedAfterComplete(t),before=f.packets.length;let pages=0;
 for await(const page of f.adapter.loadedCandidatePages()){pages++;assert.equal(page.kind,'surface-delta');}
 assert(pages>0);assert.equal(f.packets.length,before,'candidate-only reads do not ingest observations');
 await f.rescan(true);assert.equal(f.packets.length,before);assert.equal(f.facts().events.at(-1),'end');assert.equal(f.facts().membership,1000);
});
