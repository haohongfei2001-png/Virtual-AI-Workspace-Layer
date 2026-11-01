import test from 'node:test';
import assert from 'node:assert/strict';
import {currentIndex} from '../../src/navigation/current-index.mjs';

function fixture(scope='verified-scope-A'){
 return {scope,groups:[],refs:[
  {id:'first',scope,nativeUrl:'https://example.test/c/shared',nativeTitle:'First',membership:'NONE'},
  {id:'second',scope,nativeUrl:'https://example.test/c/shared',nativeTitle:'Second',membership:'NONE'},
  {id:'unknown',scope,nativeUrl:'https://example.test/c/unknown',nativeTitle:null,membership:'UNKNOWN'},
 ]};
}

test('working-set ID lookup preserves manual order, duplicate URLs and missing placeholders',()=>{
 const snapshot=fixture(),index=currentIndex(snapshot,[]),order=['unknown','second','missing','first'];
 assert.deepEqual(order.map(id=>index.byId(id)),[snapshot.refs[2],snapshot.refs[1],undefined,snapshot.refs[0]]);
 assert.equal(index.at('https://example.test/c/shared').ref,snapshot.refs[0],'native route retains first-match semantics');
 assert.equal(index.byId('second'),snapshot.refs[1],'working set selects exact ID, not first shared URL');
 assert.equal(index.byId('unknown').membership,'UNKNOWN');
});

test('compatible rebind returns current titles and UNKNOWN rows without changing the prior index',async()=>{
 const before=fixture(),index=currentIndex(before,[]),next=structuredClone(before);next.refs[1].nativeTitle='Renamed native title';next.refs[2].activityDecision={segment:null,basis:'undated'};
 const rebound=await index.rebindCompatibleAsync(next,[],()=>true);assert.ok(rebound);
 for(const row of next.refs)assert.equal(rebound.byId(row.id),row);
 assert.equal(rebound.byId('second').nativeTitle,'Renamed native title');assert.equal(rebound.byId('unknown').nativeTitle,null);
 assert.equal(index.byId('second'),before.refs[1]);assert.equal(index.byId('second').nativeTitle,'Second');
 const refs=new Map(next.refs.map(row=>[row.id,{...row,nativeTitle:row.id==='second'?'Latest':row.nativeTitle}]));
 const direct=rebound.rebind(refs,[],next.scope);assert.equal(direct.byId('second'),refs.get('second'));assert.equal(rebound.byId('second'),next.refs[1]);
});

test('cross-scope rebind rejects and a new index cannot expose old-scope references',async()=>{
 const before=fixture(),index=currentIndex(before,[]),other=fixture('verified-scope-B');other.refs=other.refs.filter(row=>row.id!=='unknown');
 await assert.rejects(index.rebindCompatibleAsync(other,[],()=>true),/cross-scope-index/);
 assert.throws(()=>index.rebind(new Map(other.refs.map(row=>[row.id,row])),[],other.scope),/cross-scope-index/);
 const fresh=currentIndex(other,[]);assert.equal(fresh.byId('unknown'),undefined);assert.equal(fresh.byId('first'),other.refs[0]);assert.equal(fresh.byId('first').scope,other.scope);assert.equal(index.byId('first'),before.refs[0]);
});
