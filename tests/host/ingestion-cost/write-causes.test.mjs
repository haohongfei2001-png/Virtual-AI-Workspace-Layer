import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,summarize} from './fixture.mjs';
import {scaleConversationId} from '../fixtures/host-scale-world.mjs';
const P='g-p-00000000000000000000000000000001';
async function open(t,options){const f=await fixture(options);t.after(()=>f.close());return f;}
function complete(facts,count){const expected=Array.from({length:count},(_,i)=>scaleConversationId(i)).sort();assert.deepEqual(Object.keys(facts.refs).sort(),expected);assert.deepEqual(Object.keys(facts.membership).sort(),expected);for(const row of Object.values(facts.membership)){assert.equal(row.state,'PROJECT');assert.equal(row.projectId,P);}}
for(const prefix of [0,2,4])test('real owner first history prefix '+prefix+' adds required membership commits, not no-op rescans',async t=>{
 const f=await open(t);if(prefix)await f.publish('history',prefix);f.project();await f.publish('members');const facts=await f.read(),summary=summarize(f.events);complete(facts,1000);
 assert.equal(summary.applyCalls,20+prefix);assert.equal(summary.successfulApplies,summary.applyCalls);assert.equal(facts.revision,21+prefix,'initial index migration has its own revision');
 assert.equal(summary.reasons['refs:new'],1000);assert.equal(summary.reasons['membership:new'],1000);assert.equal(summary.reasons['refs:semantic-change']??0,0);
 const history=summarize(f.events.filter(e=>e.label==='history')),members=summarize(f.events.filter(e=>e.label==='members'));
 assert.equal(members.applyCalls,20);assert.equal(history.applyCalls,prefix);assert.equal(members.reasons['refs:unchanged-active']??0,history.reasons['refs:new']??0);
 for(const event of f.events){assert(event.bytes<=65536);assert.equal(event.pageCalls,1);assert.equal(event.result,'accepted');}
 t.diagnostic(JSON.stringify({prefix,revision:facts.revision,summary,history,members}));
});
test('fresh identical PROJECT rescan has zero apply/write transactions and preserves every persisted timestamp',async t=>{
 const f=await open(t,{count:300});f.project();await f.publish();const before=await f.read(),at=f.events.length;f.advance(1000);await f.publish('repeat');assert.deepEqual(await f.read(),before);
 const s=summarize(f.events.slice(at));assert(s.packets>1);assert.equal(s.applyCalls,0);assert.equal(s.readwriteTransactions,0);assert.equal(s.versionFences,s.packets);
});
test('expired witnesses require real writes even when every visible semantic value is unchanged',async t=>{
 const f=await open(t,{count:300});f.project();await f.publish();const before=await f.read(),at=f.events.length;f.advance(60001);await f.publish('expired');const after=await f.read(),s=summarize(f.events.slice(at));complete(after,300);
 assert(s.applyCalls>0);assert.equal(after.revision-before.revision,s.applyCalls);assert.equal(s.reasons['refs:inactive-witness'],300);assert.equal(s.reasons['membership:inactive-witness'],300);assert.equal(s.reasons['refs:semantic-change']??0,0);
 assert(Date.parse(after.refs[f.rows[0].id].validUntil)>Date.parse(before.refs[f.rows[0].id].validUntil));
});
test('source revocation needs a fresh incarnation and never revives the old source',async t=>{
 const f=await open(t,{count:300});f.project();await f.publish();const before=await f.read(),oldSource=before.refs[f.rows[0].id].sourceId;await f.revokeSource();const at=f.events.length;await f.publish('revalidate');const after=await f.read(),s=summarize(f.events.slice(at));complete(after,300);
 assert.equal(s.reasons['refs:source-revalidation'],300);assert.equal(s.reasons['membership:source-revalidation'],300);assert.equal(after.sources[oldSource].revoked,true);assert.notEqual(after.refs[f.rows[0].id].sourceId,oldSource);assert.equal(after.revision-before.revision,s.applyCalls+1);
});
test('one real native rename is distinguished from unchanged rows sharing its wire fragment',async t=>{
 const f=await open(t,{count:300});f.project();await f.publish();const before=await f.read(),at=f.events.length;f.members.children[100].textContent='Changed native title';f.history.children[100].textContent='Changed native title';await f.publish('rename');const after=await f.read(),s=summarize(f.events.slice(at));
 assert.equal(after.refs[f.rows[100].id].nativeTitle,'Changed native title');assert.equal(s.reasons['refs:semantic-change'],1);assert.equal(s.applyCalls,1);assert.equal(after.revision,before.revision+1);complete(after,300);
 assert((s.reasons['refs:unchanged-active']??0)>0,'unchanged rows in a changed packet are not mislabeled as additional semantic changes');
});
test('changed revision at no-op version fence retries without acknowledging a stale snapshot',async t=>{
 const f=await open(t,{count:30});f.project();await f.publish();const before=await f.read(),version=f.native.version.bind(f.native);f.native.version=async(...args)=>(await version(...args))+1;
 const result=await f.send([...f.proposals()][0],'revision-conflict');assert.equal(result.state,'retry-after');assert.equal(f.events.at(-1).applies.length,0);assert.deepEqual(await f.read(),before);
});
test('authority loss at no-op version fence rejects rather than counting a zero-write acceptance',async t=>{
 const f=await open(t,{count:30});f.project();await f.publish();const before=await f.read(),version=f.native.version.bind(f.native);f.native.version=async(...args)=>{const result=await version(...args);f.revoke();return result;};
 const result=await f.send([...f.proposals()][0],'revoked');assert.equal(result.state,'rejected');assert.equal(f.events.at(-1).applies.length,0);assert.deepEqual(await f.read(),before);
});
test('diagnostic reduction exposes only bounded aggregate counts and store names',async t=>{
 const f=await open(t,{count:30});f.project();await f.publish();const output=JSON.stringify({events:f.events,summary:summarize(f.events)});
 for(const privateText of [f.rows[0].id,f.rows[0].title,P,'ingestion_fixture','document','producer'])assert(!output.includes(privateText),privateText+' leaked');
});
test('finite history prefix does not pre-sample unseen later DOM pages',async t=>{const f=await open(t);await f.publish('history',2);assert.equal(f.events.length,2);assert(f.metrics.historyVisits>0&&f.metrics.historyVisits<1000);assert.equal(f.metrics.memberVisits,0);});
test('counting wrappers preserve uninstrumented owner facts and packet settlement',async t=>{
 const outcomes=[];for(const record of [false,true]){const f=await open(t,{count:60,record});await f.publish('history',1);f.project();await f.publish('members');await f.publish('repeat');f.members.children[10].textContent='Renamed';f.history.children[10].textContent='Renamed';await f.publish('rename');outcomes.push({facts:await f.read(),settlements:f.events.map(e=>e.result)});}assert.deepEqual(outcomes[1],outcomes[0]);
});
