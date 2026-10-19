import test from 'node:test';
import assert from 'node:assert/strict';
import * as identity from '../../src/host/session-identity.mjs';

const structures=new Map([['personal','personal']]);
const entry=()=>({account:{account_id:'PRIVATE_ID',structure:'personal'},name:'PRIVATE_NAME'});
const roster=()=>({accounts:{PRIVATE_ID:entry()}});
const cases=[
 ['root-object',()=>null],
 ['accounts-object',()=>({accounts:[]})],
 ['accounts-limit',()=>({accounts:Object.fromEntries(Array.from({length:1001},(_,i)=>['x'+i,entry()]))})],
 ['entry-key',()=>({accounts:{'PRIVATE BAD':entry()}})],
 ['entry-object',()=>({accounts:{PRIVATE_ID:null}})],
 ['account-object',()=>({accounts:{PRIVATE_ID:{account:[]}}})],
 ['account-id',()=>({accounts:{PRIVATE_ID:{account:{account_id:'PRIVATE BAD',structure:'personal'}}}})],
 ['account-structure',()=>({accounts:{PRIVATE_ID:{account:{account_id:'PRIVATE_ID',structure:null}}}})],
 ['deactivated-flag',()=>({accounts:{PRIVATE_ID:{account:{...entry().account,is_deactivated:null}}}})],
 ['session-access-flag',()=>({accounts:{PRIVATE_ID:{...entry(),can_access_with_session:'PRIVATE_BAD'}}})],
 ['nondefault-alias',()=>({accounts:{PRIVATE_ALIAS:entry()}})],
 ['default-canonical-missing',()=>({accounts:{default:entry()}})],
 ['default-entry-mismatch',()=>({accounts:{...roster().accounts,default:{...entry(),name:'PRIVATE_DIFFERENT'}}})],
 ['default-entry-uncomparable',()=>{const value=entry();value.extra=undefined;return {accounts:{PRIVATE_ID:value,default:entry()}};}],
];
for(const [expected,body]of cases)test(`roster rejection retains generic contract and reports only fixed branch: ${expected}`,()=>{
 let caught;assert.throws(()=>identity.sessionContexts(body(),structures),error=>{caught=error;return error.message==='invalid-accounts-schema';});
 assert.equal(identity.sessionContextSchemaIssue(caught),expected);
 assert(!JSON.stringify(caught).includes('PRIVATE'));
 assert(!String(caught.stack).includes('PRIVATE'));
});
test('diagnostic cannot be forged and a valid empty roster stays distinct from rejection',()=>{
 assert.equal(identity.sessionContextSchemaIssue(Object.assign(Error('invalid-accounts-schema'),{schemaIssue:'PRIVATE'})),null);
 assert.equal(identity.sessionContextSchemaIssue(null),null);
 assert.deepEqual(identity.sessionContexts({accounts:{}},structures),[]);
 const original=roster();assert.deepEqual(identity.sessionContexts(original,structures),[{id:'PRIVATE_ID',kind:'personal'}]);assert.deepEqual(original,roster());
});
