import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAccountsStructure} from '../../tools/native-me-probe/accounts-structure.mjs';
import {createNativeAccountsProbe} from '../../tools/native-me-probe/accounts.mjs';
const entry=extra=>({account:{id:'PRIVATE_ID',structure:'personal',...extra},can_access_with_session:true,name:'PRIVATE_NAME',token:'PRIVATE_TOKEN'});
test('whole roster summarizes alternate field shape without exposing or authorizing it',()=>{
 const v=entry(),body={accounts:{PRIVATE_ID:v,default:structuredClone(v)}};const s=summarizeAccountsStructure(body);
 assert.equal(s.entryCount,2);assert.equal(s.groups.ordinary.entries,1);assert.equal(s.groups.default.entries,1);
 for(const g of Object.values(s.groups)){assert.deepEqual(g.account_id,{missing:1});assert.deepEqual(g.id,{'valid-string':1});assert.deepEqual(g.keyEqualsAccountId,{incomparable:1});assert.deepEqual(g.fieldsEqual,{incomparable:1});assert.deepEqual(g.structure,{personal:1});assert.deepEqual(g.sessionAccess,{true:1});}
 assert.deepEqual(s.groups.ordinary.keyEqualsId,{equal:1});assert.deepEqual(s.groups.default.keyEqualsId,{different:1});
 assert.deepEqual(s.defaultAlias,{account_id:{relation:'incomparable'},id:{relation:'canonical-present',canonicalType:'object',sameKey:false,wholeEntryEqual:'equal'}});
 assert(!JSON.stringify(s).includes('PRIVATE'));assert(Object.isFrozen(s.groups.ordinary.account_id));assert.deepEqual(body,{accounts:{PRIVATE_ID:v,default:structuredClone(v)}});
});
test('identifier categories cover missing, type and all current grammar failures',()=>{
 const values=[null,{},[],7,true,'','x'.repeat(257),'PRIVATE BAD','constructor','PRIVATE_VALID'];
 const accounts=Object.fromEntries(values.map((v,i)=>['PRIVATE_KEY_'+i,entry({account_id:v})]));accounts.PRIVATE_MISSING=entry();
 const g=summarizeAccountsStructure({accounts}).groups.ordinary;
 assert.deepEqual(g.account_id,{null:1,object:1,array:1,number:1,boolean:1,empty:1,'too-long':1,'whitespace-control':1,reserved:1,'valid-string':1,missing:1});
 assert.equal(g.duplicateIds,10);assert.equal(g.duplicateAccountIds,0);assert(!JSON.stringify(g).includes('PRIVATE'));
});
test('unrelated malformed entries and flags are counted rather than hidden by first failure',()=>{
 const body={accounts:{A:null,B:[],C:{},D:{account:null},E:entry({account_id:'ID',id:'ID',structure:'PRIVATE_UNKNOWN',is_deactivated:null}),F:{...entry({account_id:'ID',id:'ID',structure:7,is_deactivated:true}),can_access_with_session:'PRIVATE_BAD'}}};
 const g=summarizeAccountsStructure(body).groups.ordinary;
 assert.equal(g.entries,6);assert.deepEqual(g.entryType,{null:1,array:1,object:4});assert.deepEqual(g.accountType,{missing:3,null:1,object:2});
 assert.deepEqual(g.structure,{missing:4,'other-string':1,number:1});assert.deepEqual(g.isDeactivated,{missing:4,null:1,true:1});assert.deepEqual(g.sessionAccess,{missing:4,true:1,string:1});assert.equal(g.duplicateAccountIds,1);assert.equal(g.duplicateIds,1);
 assert(!JSON.stringify(g).includes('PRIVATE'));
});
test('default comparison checks complete canonical entry and never emits its metadata',()=>{
 const v=entry({account_id:'PRIVATE_ID'}),alias=structuredClone(v);alias.name='PRIVATE_DIFFERENT';
 const s=summarizeAccountsStructure({accounts:{PRIVATE_ID:v,default:alias}});assert.equal(s.defaultAlias.id.wholeEntryEqual,'different');assert.equal(s.defaultAlias.account_id.wholeEntryEqual,'different');
 assert.equal(summarizeAccountsStructure({accounts:{default:v}}).defaultAlias.id.relation,'canonical-missing');
 assert(!JSON.stringify(s).includes('PRIVATE'));
});
test('invalid containers and original cardinality bound are explicit; deadline loss is not swallowed',()=>{
 assert.equal(summarizeAccountsStructure(null).rootType,'null');assert.equal(summarizeAccountsStructure({accounts:[]}).accountsType,'array');
 const s=summarizeAccountsStructure({accounts:Object.fromEntries(Array.from({length:1001},(_,i)=>['PRIVATE_'+i,{}]))});assert.equal(s.overLimit,true);assert.equal(s.groups.ordinary.entries,0);
 let checks=0;assert.throws(()=>summarizeAccountsStructure({accounts:{A:entry(),B:entry()}},{check(){if(++checks===3)throw Error('request-timeout');}}),/request-timeout/);
});
test('new structural probe dispatches exactly once and returns summary despite strict parser rejection',async()=>{
 let calls=0;const target='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
 const p=createNativeAccountsProbe({structural:true,fetch:async(url)=>{calls++;assert.equal(url,target);const r=new Response(JSON.stringify({accounts:{PRIVATE_ID:entry()}}),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:target});return r;}});
 const r=await p.run();assert.equal(r.reason,'accounts-schema:account-id');assert.deepEqual(r.structure.groups.ordinary.account_id,{missing:1});assert.equal(calls,1);assert(!JSON.stringify(r).includes('PRIVATE'));assert(Object.isFrozen(r.structure));
 assert.deepEqual(await p.run(),{state:'already-consumed'});assert.equal(calls,1);
});
test('schema-error path checks the same post-analysis deadline as successful parsing',async()=>{
 const target='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
 const fetchFor=valid=>async()=>{const r=new Response(JSON.stringify({accounts:{PRIVATE_ID:entry(valid?{account_id:'PRIVATE_ID'}:{})}}),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:target});return r;};
 let samples=0;const good=await createNativeAccountsProbe({structural:true,now:()=>{samples++;return 0;},fetch:fetchFor(true)}).run();assert.equal(good.reason,'accounts-schema-valid-not-authorized');
 // After the post-parse check, success also checks the shared deadline wrapper
 // and final post-await boundary. Rejection must not escape the first check.
 let checks=0;const failed=await createNativeAccountsProbe({structural:true,now:()=>++checks>=samples-2?6000:0,fetch:fetchFor(false)}).run();
 assert.equal(failed.reason,'request-timeout');assert.equal(failed.structure,null);
});
