import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionContexts} from '../../src/host/session-identity.mjs';

const structures=new Map([['personal','personal'],['team','organization']]);
const personal='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const entry=(id=personal,extra={})=>{const {can_access_with_session,...accountExtra}=extra;return {account:{account_id:id,structure:'personal',...accountExtra},access:{role:'owner',features:['a','b']},...(Object.hasOwn(extra,'can_access_with_session')?{can_access_with_session}:{})};};
const read=accounts=>sessionContexts({accounts},structures);
const reject=accounts=>assert.throws(()=>read(accounts),/invalid-accounts-schema/);

test('canonical roster remains supported without access flags',()=>{
 assert.deepEqual(read({[personal]:entry()}),[{id:personal,kind:'personal'}]);
});
test('literal default alias of complete canonical entry is deduplicated without becoming a context',()=>{
 const value=entry();
 assert.deepEqual(read({default:structuredClone(value),[personal]:value}),[{id:personal,kind:'personal'}]);
 assert.deepEqual(read({[personal]:value,default:structuredClone(value)}),[{id:personal,kind:'personal'}]);
});
test('default equality is independent of object key order but preserves nested values',()=>{
 const value=entry();
 const alias={access:{features:['a','b'],role:'owner'},account:{structure:'personal',account_id:personal}};
 assert.deepEqual(read({default:alias,[personal]:value}),[{id:personal,kind:'personal'}]);
});
test('default alone does not provide canonical evidence',()=>reject({default:entry()}));
test('arbitrary aliases remain invalid even when entries are identical',()=>reject({other:entry(),[personal]:entry()}));
test('default cannot silently disagree with canonical metadata',()=>{
 for(const alias of [entry(personal,{structure:'team'}),{...entry(),access:{role:'viewer',features:['a','b']}},{...entry(),access:{role:'owner',features:['b','a']}},{...entry(),extra:null}]){
  reject({default:alias,[personal]:entry()});
 }
});
test('inherited canonical key cannot support a default alias',()=>{
 const accounts=Object.create({[personal]:entry()});accounts.default=entry();reject(accounts);
});
test('deactivated organization is excluded despite session access being true',()=>{
 assert.deepEqual(read({[organization]:entry(organization,{structure:'team',is_deactivated:true,can_access_with_session:true}),[personal]:entry(),default:entry()}),[{id:personal,kind:'personal'}]);
});
test('explicit session denial excludes account without assuming active context',()=>{
 assert.deepEqual(read({[personal]:entry(personal,{can_access_with_session:false})}),[]);
 assert.deepEqual(read({[personal]:entry(personal,{is_deactivated:false,can_access_with_session:true})}),[{id:personal,kind:'personal'}]);
});
test('nonboolean access flags fail closed even on otherwise excluded entries',()=>{
 for(const field of ['is_deactivated','can_access_with_session'])for(const value of [null,0,1,'false','true',[],{}])reject({[personal]:entry(personal,{[field]:value})});
 reject({[personal]:entry(personal,{is_deactivated:true,can_access_with_session:'false'})});
});
test('unknown structure remains unknown rather than being promoted by default',()=>{
 const value=entry(personal,{structure:'new-host-kind'});
 assert.deepEqual(read({[personal]:value,default:structuredClone(value)}),[{id:personal,kind:'unknown'}]);
});
test('malformed excluded account still fails schema validation',()=>{
 reject({[personal]:entry('different-id',{is_deactivated:true})});
 reject({[personal]:entry(personal,{structure:null,is_deactivated:true})});
});
