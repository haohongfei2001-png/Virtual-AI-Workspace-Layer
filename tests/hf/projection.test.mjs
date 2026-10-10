import test from 'node:test';
import assert from 'node:assert/strict';
import { project, windowFor, segmentFor, latestSend, localDay } from '../../src/navigation/projection.mjs';
import { dataset, FIXTURE_NOW, syntheticURL, routeInfo } from '../../simulator/data.mjs';
const now=FIXTURE_NOW,zone='Asia/Shanghai';
for(const timeZone of ['Asia/Shanghai','America/New_York','Europe/Berlin','Pacific/Kiritimati','Pacific/Honolulu'])test('120 contiguous 30-local-day segments '+timeZone,()=>{
 for(let k=0;k<120;k++){const w=windowFor(k,now,timeZone),older=windowFor(k+1,now,timeZone);assert.equal(Date.parse(w.endExclusive)-Date.parse(w.start),30*86400000);assert.equal(older.endExclusive,w.start);}
});
test('current segment includes exactly today and preceding 29 local days',()=>{assert.deepEqual(windowFor(0,now,zone),{start:'2026-09-12',endExclusive:'2026-10-12'});assert.equal(segmentFor('2026-09-11T16:00:00Z',now,zone),0);assert.equal(segmentFor('2026-09-11T15:59:59Z',now,zone),1);});
test('DST is calendar-based, not 720 hours',()=>{const t='2026-03-30T04:00:00Z';assert.equal(segmentFor('2026-03-01T05:00:00Z',t,'America/New_York'),0);assert.equal(localDay(t,'America/New_York')-localDay('2026-03-01T05:00:00Z','America/New_York'),29);});
test('leap day included',()=>assert.deepEqual(windowFor(0,'2024-03-01T12:00:00Z','UTC'),{start:'2024-02-01',endExclusive:'2024-03-02'}));
test('invalid zone and negative segment rejected',()=>{assert.throws(()=>windowFor(-1,now,zone));assert.throws(()=>windowFor(0,now,'bad-zone'));});
test('future and naive times remain unknown',()=>{assert.equal(segmentFor('2099-01-01T00:00:00Z',now,zone),null);assert.equal(segmentFor('2026-10-10T00:00:00',now,zone),null);});
test('single latest theme segment; old children stay parent',()=>{const g=project(dataset(),now,zone)[0];assert.equal(g.segment,0);assert(g.old.some(r=>r.id==='T2'));assert(g.unknown.some(r=>r.id==='T3'));assert.equal(g.id,'W0');});
test('current positive observation does not require full old coverage',()=>{const d=dataset();d.refs[0].coverage=null;assert.equal(project(d,now,zone)[0].segment,0);});
test('old snapshot cannot assert no recent input',()=>{const d=dataset();for(const r of d.refs.filter(r=>r.id.startsWith('T3')))r.coverage.through='2026-08-05T00:00:00Z';assert.equal(project(d,now,zone)[3].segment,null);});
test('old child with a coverage gap is unknown, not forcibly historical',()=>{const d=dataset();d.refs.find(r=>r.id==='T2').coverage.gaps=1;const g=project(d,now,zone)[0];assert(!g.old.some(r=>r.id==='T2'));assert(g.unknown.some(r=>r.id==='T2'));});
test('visit/update/assistant/edit timestamps never activate',()=>{const r=dataset().refs[3];r.updated_at=now;r.visitedAt=now;r.events=[{...dataset().refs[0].events[0],kind:'edit',sentAt:now}];assert.equal(latestSend(r,now),null);r.events[0].kind='new-send';r.events[0].role='assistant';assert.equal(latestSend(r,now),null);});
test('duplicate events idempotent, conflicting times quarantined',()=>{const r=dataset().refs[0],t=latestSend(r,now);r.events.push({...r.events[0]});assert.equal(latestSend(r,now),t);r.events.push({...r.events[0],sentAt:'2026-10-09T08:00:00Z'});assert.equal(latestSend(r,now),null);});
test('scope collision rejected even for same native ID/title',()=>{const d=dataset();d.refs.push(dataset('B').refs[0]);assert.throws(()=>project(d,now,zone),/cross-scope/);});
test('theme scope mismatch rejected',()=>{const d=dataset();d.themes[0].scope='B';assert.throws(()=>project(d,now,zone));});
test('time-zone projection does not mutate source',()=>{const d=dataset(),before=JSON.stringify(d);project(d,now,'Pacific/Honolulu');project(d,now,'Asia/Shanghai');assert.equal(JSON.stringify(d),before);});
test('120 themes and all 604 references accounted for',()=>{const d=dataset('A','https://vaiwl-hf.test',120),g=project(d,now,zone);assert.equal(d.refs.length,604);assert.equal(g.length,120);assert.equal(g.reduce((n,t)=>n+t.current.length+t.old.length+t.unknown.length,0),604);});
test('cross-Project references aggregate without native mutation',()=>{const d=dataset(),before=JSON.stringify(d);const g=project(d,now,zone)[0];assert(g.members.includes('T0')&&g.members.includes('T1')&&g.members.includes('T2'));assert.equal(JSON.stringify(d),before);});
test('only explicit synthetic origins and paths accepted',()=>{assert(syntheticURL('http://127.0.0.1:48173/hf/A/c/T0?mode=mv3'));for(const raw of ['https://chatgpt.com/c/T0','https://evil.test/hf/A/c/T0','http://127.0.0.1/private','http://x:y@127.0.0.1/hf/A/c/T0','http://127.0.0.1/hf/A/c/T0#x'])assert(!syntheticURL(raw));assert.equal(routeInfo('https://chatgpt.com'),null);});

test('impossible calendar instants are unknown rather than normalized into a different day',()=>{for(const t of ['2026-02-30T00:00:00Z','2026-13-01T00:00:00Z','2026-10-01T24:00:00Z','2026-10-01T00:00:00+24:00'])assert.equal(segmentFor(t,now,zone),null);});
