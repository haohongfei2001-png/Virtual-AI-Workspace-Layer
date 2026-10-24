import test from 'node:test';import assert from 'node:assert/strict';
import {instant} from '../../src/navigation/projection.mjs';
import {projectFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
// Fixed pre-cache parser oracle. Keep independent of implementation internals.
function original(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),check=new Date(0);check.setUTCFullYear(year,month-1,day);
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
 if(m[7]!=='Z'&&(Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59))return null;
 const n=Date.parse(value);return Number.isFinite(n)?n:null;
}
const valid=['1970-01-01T00:00:00Z','1969-12-31T23:59:59.999Z','0000-02-29T00:00:00Z','0099-01-01T00:00:00Z','0100-03-01T00:00:00Z','2000-02-29T00:00:00Z','2400-02-29T00:00:00Z','9999-12-31T23:59:59.999Z','2026-10-13T08:00:00+08:00','2026-10-13T00:00:00Z','2026-10-13T00:00:00-23:59','2026-10-13T00:00:00+23:59','2026-10-13T00:00:00.1Z','2026-10-13T00:00:00.12Z','2026-10-13T00:00:00.123Z'];
const invalid=['','1900-02-29T00:00:00Z','2100-02-29T00:00:00Z','2026-02-30T00:00:00Z','2026-00-01T00:00:00Z','2026-13-01T00:00:00Z','2026-01-00T00:00:00Z','2026-01-32T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:60:00Z','2026-01-01T00:00:60Z','2026-01-01T00:00:00+24:00','2026-01-01T00:00:00+00:60','2026-01-01T00:00:00','2026-01-01T00:00:00z','2026-01-01T00:00:00.1234Z','2026-01-01T00:00:00Ztail',' 2026-01-01T00:00:00Z'];
test('cold and warm results preserve strict epochs offsets fractions leap years and early years',()=>{for(let pass=0;pass<3;pass++)for(const value of valid){assert.notEqual(original(value),null,value);assert.equal(instant(value),original(value),value);}assert.equal(instant(valid[0]),0);assert.equal(instant(valid[8]),instant(valid[9]));});
test('invalid strings never become valid after repeated calls and exact keys are not normalized',()=>{for(let pass=0;pass<3;pass++)for(const value of invalid){assert.equal(original(value),null,value);assert.equal(instant(value),null,value);}for(const suffix of ['\n','\r','\r\n','\u2028']){const value=valid[0]+suffix;assert.equal(instant(value),original(value));assert.equal(instant(value),original(value));}});
test('non-string inputs never invoke conversion hooks even after same string was cached',()=>{let hooks=0;const value={toString(){hooks++;return valid[0];},valueOf(){hooks++;return 0;},[Symbol.toPrimitive](){hooks++;return valid[0];}};instant(valid[0]);for(const input of [null,undefined,0,false,123n,Symbol('date'),new Date(0),new String(valid[0]),value,[]])assert.equal(instant(input),null);assert.equal(hooks,0);});
test('more than cache capacity unique values plus long invalid keys retain original results',()=>{const values=Array.from({length:800},(_,i)=>new Date(Date.UTC(2030,0,1)+i*1000).toISOString());for(const value of values)assert.equal(instant(value),original(value));for(const value of [values[0],values[255],values[256],values.at(-1),...invalid,'x'.repeat(65536),valid[0]+' '.repeat(1000)]){assert.equal(instant(value),original(value));assert.equal(instant(value),original(value));}});
test('isolated module parses a repeated raw timestamp only once including epoch zero',async()=>{const isolated=await import('../../src/navigation/projection.mjs?instant-cache-counter='+crypto.randomUUID()),parse=Date.parse;let calls=0;Date.parse=(...args)=>{calls++;return parse(...args);};try{const value='1970-01-01T00:00:00Z';assert.equal(isolated.instant(value),0);assert.equal(isolated.instant(value),0);assert.equal(calls,1);assert.equal(isolated.instant('1970-01-01T01:00:00+01:00'),0);assert.equal(calls,2);}finally{Date.parse=parse;}});
test('cached timestamps do not cache actor scope source revocation or now-dependent expiry',()=>{
 const scope='scope-A',now='2026-10-13T12:00:00Z',snapshot={scope,refs:[{id:'a',scope}],projects:[],noProject:[{id:'a'}],unknown:[]},session=createFreeViewSession({now,timeZone:'UTC'}),e={scopeKey:scope,sources:{s:{revoked:false}},events:{},coverage:{},hints:{h:{id:'h',sourceId:'s',eventKey:'event',conversationId:'a',actorVerified:true,actorScopeKey:scope,hintType:'local-confirmed-send',observedAt:now,validUntil:'2026-10-13T12:10:00Z'}}};
 const decision=(time=now)=>projectFreeActivity(snapshot,e,session,time).refs[0].activity;
 assert.equal(decision().segment,0);assert.equal(decision('2026-10-13T12:11:00Z').segment,null);assert.equal(decision().segment,0);
 e.sources.s.revoked=true;assert.equal(decision().segment,null);e.sources.s.revoked=false;e.hints.h.actorScopeKey='scope-B';assert.equal(decision().segment,null);e.hints.h.actorScopeKey=scope;assert.equal(decision().segment,0);
 assert.throws(()=>projectFreeActivity(snapshot,{...e,scopeKey:'scope-B'},session,now),/cross-scope/);
});
