import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialControlProbe} from '../../tools/native-me-probe/credential-control.mjs';
import {buildProbe} from '../../tools/native-me-probe/build.mjs';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
const me='https://chatgpt.com/backend-api/me',accounts='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const nullRoster={accounts:{default:{account:{account_id:null,structure:'personal',is_deactivated:false},can_access_with_session:true,name:'PRIVATE'}}};
function response(url,body,{status=200,headers={},redirected=false}={}){const r=new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});Object.defineProperties(r,{url:{value:url},redirected:{value:redirected}});return r;}
function fixture({alter=()=>{},now=()=>0,signal,isCurrent}={}){
 const calls=[];const probe=createCredentialControlProbe({now,signal,isCurrent,fetch:async(url,options)=>{calls.push({url,options});const n=calls.length,next={body:n<3?{id:'PRIVATE_SUBJECT',email:'PRIVATE_EMAIL'}:nullRoster,options:n===2?{status:401}:{}};alter(n,next);return response(url,next.body,next.options);}});return {probe,calls};
}
test('bounded four-request control emits only categories; unresolved roster stays rejected',async()=>{
 const {probe,calls}=fixture(),r=await probe.run();assert.equal(r.reason,'control-complete-not-authorized');assert.equal(r.credentialDependence,'include-id-omit-denied');
 assert.deepEqual(calls.map(c=>[c.url,c.options.credentials]),[[me,'include'],[me,'omit'],[accounts,'include'],[accounts,'omit']]);
 for(const c of calls)assert.deepEqual({...c.options,signal:null},{method:'GET',credentials:c.options.credentials,cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:null});
 for(const k of ['accountsInclude','accountsOmit']){assert.equal(r[k].selectedFieldSchemaValid,false);assert.equal(r[k].schemaIssue,'default-null-context-id');}
 assert.equal(r.identityEnabled,false);assert(!JSON.stringify(r).includes('PRIVATE'));assert(!('expiresAt'in r));assert(Object.isFrozen(r.accountsInclude.structure.groups));
 assert.deepEqual(await probe.run(),{state:'already-consumed'});assert.equal(calls.length,4);
});
test('same ID without credentials stops before accounts; different ID is inconclusive',async()=>{
 for(const same of [true,false]){const {probe,calls}=fixture({alter(n,x){if(n===2){x.options={};x.body={id:same?'PRIVATE_SUBJECT':'PRIVATE_OTHER'};}}});const r=await probe.run();assert.equal(calls.length,same?2:4);assert.equal(r.meRelation,same?'same':'different');assert.equal(r.credentialDependence,same?'not-established':'inconclusive');assert(!JSON.stringify(r).includes('PRIVATE'));}
});
for(const stage of [1,2,3,4])for(const fault of ['challenge','rate','redirect','oversize'])test(`stage ${stage} ${fault} cannot dispatch a later request`,async()=>{
 const {probe,calls}=fixture({alter(n,x){if(n!==stage)return;x.options={};if(fault==='challenge')x.options={status:403,headers:{'cf-mitigated':'challenge'}};if(fault==='rate')x.options.status=429;if(fault==='redirect')x.options.redirected=true;if(fault==='oversize')x.options.headers={'content-length':String(stage<3?262145:1048577)};}});
 const r=await probe.run();assert.equal(calls.length,stage);assert.equal(r.reason,{challenge:'session-challenged',rate:'rate-limited',redirect:'invalid-session-response',oversize:'session-response-too-large'}[fault]);
});
test('missing included subject stops immediately; omitted missing ID does not prove authentication',async()=>{
 for(const stage of [1,2]){const {probe,calls}=fixture({alter(n,x){if(n===stage){x.options={};x.body={email:'PRIVATE'};}}});const r=await probe.run();assert.equal(calls.length,stage===1?1:4);assert.equal(r.credentialDependence,stage===1?'not-established':'inconclusive');}
});
test('one elapsed deadline spans all four requests and discards expired observations',async()=>{
 let time=0;const {probe,calls}=fixture({now:()=>time,alter(){time+=2000;}});const r=await probe.run();assert.equal(r.reason,'request-timeout');assert.equal(calls.length,3);assert.equal(r.meInclude,null);assert.equal(r.accountsInclude,null);
});
test('abort and late transport cannot send again or mutate published result',async()=>{
 const abort=new AbortController();let finish,calls=0;const probe=createCredentialControlProbe({signal:abort.signal,fetch:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=probe.run();assert.deepEqual(await probe.run(),{state:'already-consumed'});abort.abort();const r=await pending,snapshot=JSON.stringify(r);finish(response(me,{id:'PRIVATE'}));await new Promise(r=>setTimeout(r,0));assert.equal(JSON.stringify(r),snapshot);assert.equal(calls,1);assert.equal(r.reason,'document-changed');assert.equal(r.meInclude,null);
});
test('plain omitted denial body is never parsed; include denial remains a failure',async()=>{
 for(const omitted of [true,false]){let calls=0,reads=0;const probe=createCredentialControlProbe({fetch:async(url)=>{calls++;if(calls===(omitted?2:1))return {url,status:401,redirected:false,headers:new Headers({'content-type':'application/json'}),body:{getReader(){reads++;throw Error('PRIVATE');},cancel(){return Promise.resolve();}}};return response(url,calls<3?{id:'PRIVATE'}:nullRoster);}});const r=await probe.run();assert.equal(reads,0);assert.equal(calls,omitted?4:1);assert.equal(r.reason,omitted?'control-complete-not-authorized':'session-unauthorized');}
});
test('stream byte cap cancels oversized payload without content-length',async()=>{
 let calls=0,cancelled=false;const p=createCredentialControlProbe({fetch:async url=>{calls++;return {url,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(262145));},cancel(){cancelled=true;}})};}});assert.equal((await p.run()).reason,'session-response-too-large');assert.equal(calls,1);assert(cancelled);
});
test('explicit overlay preserves product files and permissions; old messages cannot invoke new grant',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-control-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const base=join(dir,'base'),out=join(dir,'out');buildHost(base,{observedChatGPTContext:true,temporaryReadOnly:true});const receipt=buildProbe(base,out,0,{credentialControl:true});
 assert.equal(receipt.kind,'AUTHORIZED_CREDENTIAL_CONTROL_NOT_PRODUCT');assert.deepEqual(receipt.maxBodyBytes,[262144,262144,1048576,1048576]);assert.deepEqual(receipt.credentialsModes,['include','omit','include','omit']);verifyHost(base);assert.throws(()=>verifyHost(out));assert.throws(()=>buildProbe(base,join(dir,'bad'),0,{credentialControl:true,candidateChain:true}),/invalid-diagnostic-mode/);
 const a=JSON.parse(readFileSync(join(base,'manifest.json'))),b=JSON.parse(readFileSync(join(out,'manifest.json')));for(const k of ['permissions','host_permissions','web_accessible_resources'])assert.deepEqual(a[k],b[k]);for(const name of ['content.js','extension/worker.mjs'])assert.deepEqual(readFileSync(join(base,name)),readFileSync(join(out,name)));
 assert(readFileSync(join(out,'native-me-probe-config.mjs'),'utf8').includes('vaiwl-credential-control-20261021-consumed'));
 let listener,finish,calls=0;const events=new Map(),window={addEventListener:(k,v)=>events.set(k,v)},document={visibilityState:'visible',addEventListener:(k,v)=>events.set(k,v)};window.top=window;
 const context=vm.createContext({window,document,location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},crypto:{randomUUID:()=> 'fresh'},AbortController,AbortSignal,TextDecoder,TextEncoder,Uint8Array,performance,setTimeout,clearTimeout,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}}},fetch:()=>{calls++;return new Promise(r=>finish=r);}});vm.runInContext(readFileSync(join(out,'native-me-probe.js'),'utf8'),context);
 const sender={id:'test',url:'chrome-extension://test/native-me-probe.html'};
 for(const prefix of ['VAIWL_ME_PROBE','VAIWL_ME_CANDIDATE','VAIWL_ACCOUNTS_SCHEMA','VAIWL_ACCOUNTS_STRUCTURE'])listener({type:prefix+'_ONCE',documentKey:'fresh'},sender,()=>assert.fail('old grant reused'));
 assert.equal(calls,0);const ready=await new Promise(r=>listener({type:'VAIWL_CREDENTIAL_CONTROL_READY'},sender,r));assert.equal(ready.receiverVersion,5);
 let stale;listener({type:'VAIWL_CREDENTIAL_CONTROL_STATUS',documentKey:'old-document'},sender,r=>stale=r);assert.equal(stale.state,'document-changed-no-retry');
 listener({type:'VAIWL_CREDENTIAL_CONTROL_STATUS'},sender,()=>assert.fail('unbound status must not read a new document'));
 assert.equal(calls,0);
 const pending=new Promise(r=>listener({type:'VAIWL_CREDENTIAL_CONTROL_ONCE',documentKey:'fresh'},sender,r));events.get('pointerdown')({isTrusted:true});const result=await pending;assert.equal(result.reason,'document-changed');finish(response(me,{id:'PRIVATE'}));await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});
test('popup durable marker serializes two clicks and preserves every old permission',async()=>{
 const key='vaiwl-credential-control-20261021-consumed',storage=new Map(['vaiwl-native-me-probe-20261019-consumed','vaiwl-native-me-candidate-20261019-consumed','vaiwl-accounts-schema-20261019-consumed','vaiwl-accounts-structure-20261019-consumed'].map(k=>[k,'consumed'])),handlers={},messages=[];let serial=Promise.resolve();
 const elements={run:{addEventListener:(_k,f)=>handlers.run=f},read:{addEventListener:(_k,f)=>handlers.read=f},result:{textContent:''}};
 vm.runInNewContext(readFileSync(new URL('../../tools/native-me-probe/popup.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''),{AbortController,performance,setTimeout,clearTimeout,TARGET_TAB_ID:1,PROBE_KEY:key,PROBE_PREFIX:'VAIWL_CREDENTIAL_CONTROL',document:{getElementById:k=>elements[k]},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{locks:{request:(_k,_options,f)=>serial=serial.then(f)}},chrome:{tabs:{query:async()=>[{id:1,url:'https://chatgpt.com/'}],get:async()=>({url:'https://chatgpt.com/'}),sendMessage:async(_id,m)=>{messages.push(m.type);return m.type.endsWith('_READY')?{receiverVersion:5,ready:true,spent:false,statusDocumentBound:true,documentKey:'fresh'}:{state:'finished'};}}}});
 await Promise.all([handlers.run(),handlers.run()]);assert.equal(messages.filter(m=>m.endsWith('_ONCE')).length,1);assert.equal(storage.size,5);for(const [k,v]of storage)if(k!==key)assert.equal(v,'consumed');await handlers.read();assert.equal(messages.filter(m=>m.endsWith('_ONCE')).length,1);assert(elements.run.disabled);
});

test('account target-field comparison distinguishes IDs but ignores unrelated personal metadata',async()=>{
 for(const different of [false,true]){const {probe}=fixture({alter(n,x){if(n<3)return;const key=n===4&&different?'PRIVATE_B':'PRIVATE_A';x.body={accounts:{[key]:{account:{account_id:key,structure:'personal'},name:'PRIVATE_NAME_'+n}}};}});const r=await probe.run();assert.equal(r.accountsRelation,different?'different':'same');assert(!JSON.stringify(r).includes('PRIVATE'));}
});
test('HTML denial without challenge header stops; it is not credential-dependence evidence',async()=>{
 const {probe,calls}=fixture({alter(n,x){if(n===2)x.options={status:403,headers:{'content-type':'text/html'}};}});const r=await probe.run();assert.equal(calls.length,2);assert.equal(r.reason,'invalid-session-mime');assert.equal(r.credentialDependence,'not-established');
});

test('non-target alias metadata cannot affect selected-field schema or relation',async()=>{
 const {probe}=fixture({alter(n,x){if(n<3)return;const account={account_id:'PRIVATE_SPACE',structure:'personal'};x.body={accounts:{PRIVATE_SPACE:{account,name:'PRIVATE_CANONICAL',plan:{private:'A'}},default:{account,name:'PRIVATE_ALIAS_'+n,plan:{private:'B'}}}};}});const r=await probe.run();assert.equal(r.accountsInclude.selectedFieldSchemaValid,true);assert.equal(r.accountsOmit.selectedFieldSchemaValid,true);assert.equal(r.accountsRelation,'same');assert.equal(r.accountsInclude.structure.defaultAlias.account_id.wholeEntryEqual,'equal');assert(!JSON.stringify(r).includes('PRIVATE'));
});
