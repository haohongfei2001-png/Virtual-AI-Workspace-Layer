/** L-only causal probe. Real unchanged adapter/discovery/fragment modules and surfaceBatch converter.
 * DOM double implements inherited computed visibility, unlike the older unit fixture.
 * No browser, storage, grant, network, wall-time or full Host acceptance claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,rows,P} from './fixtures/priority-owned-mask.mjs';
// L-only packet evidence: no repository state, UI reachability or durable membership claim.
const payload=p=>p.kind==='current-observation'?p.payload.surface:p.payload;
const claimIds=(packets,kind)=>new Set(packets.flatMap(p=>payload(p).membershipClaims).filter(c=>c.asserted===kind).map(c=>c.conversationId));
const sorted=values=>[...values].sort();
for(const hidden of [null,'visibility-hidden'])test('L priority tail + owned toggle emits bounded claims and fresh visible claims after unmask: '+(hidden??'all members'),{timeout:5000},async t=>{
 const f=fixture({maskOnSurface:1,nativeHidden:hidden});t.after(()=>f.stop());
 await f.start();await f.drain();
 const first=f.packets.find(p=>p.kind==='surface-delta');
 assert(first.payload.membershipClaims.some(c=>c.conversationId===rows.at(-1).id&&c.asserted==='PROJECT'),'actual tail is observed before owned mask');
 assert.equal(f.candidateReads,1);
 const discovered=new Set(f.packets.flatMap(p=>payload(p).candidates).filter(c=>c.entity==='conversation').map(c=>c.target.nativeId));
 assert.deepEqual(sorted(discovered),sorted(rows.map(r=>r.id)),'packet candidate union contains exact native IDs');
 // The first discovery page contains one Project, the prioritized tail and 254
 // ordinary members. Its pre-mask fragments may legitimately finish after toggle.
 const visiblePage=new Set([...rows.slice(0,254).map(r=>r.id),rows.at(-1).id]);
 const unseen=rows.filter(r=>!visiblePage.has(r.id)).map(r=>r.id);
 const later=f.packets.slice(f.packets.indexOf(first)+1),unknown=claimIds(later,'UNKNOWN');
 for(const id of unseen)assert(unknown.has(id),'later masked packets explicitly report UNKNOWN for '+id);
 const emittedProject=claimIds(f.packets,'PROJECT');
 assert.deepEqual(sorted(emittedProject),sorted(visiblePage),'masked packets cannot upgrade any member outside the visible initial page');
 assert.equal(f.facts().events.at(-1),'end');
 assert.deepEqual(f.facts().computed,{reading:'hidden',members:'hidden',link:'hidden'});
 const beforeUnmask=f.packets.length;
 await f.rescan(false);
 const fresh=f.packets.slice(beforeUnmask),expected=rows.filter((_,i)=>!hidden||i!==300).map(r=>r.id);
 const freshProject=claimIds(fresh,'PROJECT');
 // The unchanged first visible page may be correctly deduplicated; every
 // previously unseen member still needs a fresh visible post-unmask claim.
 assert.deepEqual(sorted(new Set([...visiblePage,...freshProject])),sorted(expected),'retained visible facts plus fresh claims establish the expected member set');
 for(const id of unseen.filter(id=>expected.includes(id)))assert(freshProject.has(id),'new membership requires a fresh visible claim');
 if(hidden)assert(claimIds(fresh,'UNKNOWN').has(rows[300].id),'native hidden member remains an explicit UNKNOWN proposal');
 for(const p of f.packets){assert.deepEqual(payload(p).coverageClaims,[]);for(const c of payload(p).membershipClaims)if(c.asserted==='PROJECT')assert.equal(c.projectId,P);}
 assert.equal(f.facts().events.at(-1),'end');assert.deepEqual(f.facts().issues,[]);
});
