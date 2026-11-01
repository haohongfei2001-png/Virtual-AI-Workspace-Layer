import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostFixtureServer} from './fixtures/server.mjs';

const C='33333333-3333-4333-8333-333333333333',START=Date.parse('2026-10-19T12:34:56.789Z');
const SENT='2026-09-04T12:34:56Z',principalId='availability_fixture';
async function client(t,options={}){
 let time=START;const server=await createHostFixtureServer({journey:'J3',principalId,now:()=>time,...options});t.after(()=>server.close());
 const home=await fetch(server.url),html=await home.text(),cookie=home.headers.get('set-cookie').split(';')[0];
 const session=await (await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json();
 const headers={cookie,authorization:'Bearer '+session.accessToken};
 const detail=async()=>{const response=await fetch(server.origin+'/backend-api/conversation/'+C,{headers});assert.equal(response.status,200);return response.json();};
 const route=async()=>{const response=await fetch(server.origin+'/native/route?path='+encodeURIComponent('/c/'+C),{headers:{cookie}});assert.equal(response.status,200);return response.json();};
 return {server,html,headers,detail,route,setTime:value=>time=value};
}
test('J3 delayed historical availability adds only the pre-existing fixed original record, without a send action',async t=>{
 const f=await client(t,{originalHistoryAvailable:false}),before=await f.detail(),native=await f.route();
 const originalMessage=structuredClone(before.mapping.j3_node.message);assert.equal(Object.hasOwn(originalMessage,'original_send'),false);assert.equal(Object.hasOwn(originalMessage,'create_time'),false);
 assert.equal(before.history_semantics,'fixture-original-self-send/1');assert.equal(originalMessage.id,native.messages[0].messageId);assert.deepEqual(f.server.snapshot().actions,{});
 f.setTime(START+7*86400000);assert.deepEqual(await f.detail(),before,'clock passage alone must not publish original evidence');
 f.server.publishOriginalHistory();const after=await f.detail(),record=after.mapping.j3_node.message.original_send;
 assert.deepEqual(record,{author_id:principalId,conversation_id:C,kind:'new-send',state:'committed',precision:'second',sent_at:SENT});
 const withoutRecord=structuredClone(after);delete withoutRecord.mapping.j3_node.message.original_send;assert.deepEqual(withoutRecord,before,'all existing authenticated metadata remains unchanged');assert.deepEqual(await f.route(),native);
 f.setTime(START+20*86400000);f.server.publishOriginalHistory();assert.deepEqual(await f.detail(),after,'publication is idempotent and never dates the record at publication or read time');assert.deepEqual(f.server.snapshot().actions,{});
});
test('J3 default and explicit available mode retain immediate original historical evidence',async t=>{
 for(const options of [{},{originalHistoryAvailable:true}]){const f=await client(t,options),detail=await f.detail();assert.equal(detail.mapping.j3_node.message.original_send.sent_at,SENT);assert.deepEqual(f.server.snapshot().actions,{});}
});
test('J3 historical publication has no HTTP or native-action control and keeps authentication required',async t=>{
 const f=await client(t,{originalHistoryAvailable:false});assert(!f.html.includes('publishOriginalHistory'));assert(!f.html.includes('originalHistoryAvailable'));
 for(const path of ['/publishOriginalHistory','/native/publish-original-history','/control/publish-original-history']){
  for(const method of ['GET','POST'])assert.equal((await fetch(f.server.origin+path,{method,headers:f.headers})).status,404);
 }
 const command=await fetch(f.server.origin+'/native/action',{method:'POST',headers:{...f.headers,'content-type':'application/json'},body:JSON.stringify({kind:'publishOriginalHistory'})});assert.equal(command.status,400);
 assert.equal(Object.hasOwn((await f.detail()).mapping.j3_node.message,'original_send'),false);assert.deepEqual(f.server.snapshot().actions,{});
 f.server.publishOriginalHistory();assert.equal((await fetch(f.server.origin+'/backend-api/conversation/'+C)).status,401);assert.equal((await fetch(f.server.origin+'/backend-api/conversation/'+C,{headers:{cookie:f.headers.cookie}})).status,401);
 assert.equal((await f.detail()).mapping.j3_node.message.original_send.sent_at,SENT);
});
test('history availability validates boolean values and limits delayed mode to J3',async()=>{
 for(const originalHistoryAvailable of [null,0,1,'false',{},[]])await assert.rejects(createHostFixtureServer({journey:'J3',originalHistoryAvailable}),/invalid-fixture-original-history-availability/);
 for(const options of [{},{journey:'J1'},{journey:'J2'},{journey:'FIRST_SEND'},{profile:'MODERN'}])await assert.rejects(createHostFixtureServer({...options,originalHistoryAvailable:false}),/invalid-fixture-original-history-availability/);
 const legacy=await createHostFixtureServer();try{assert.throws(()=>legacy.publishOriginalHistory(),/original-history-requires-j3/);}finally{await legacy.close();}
});
