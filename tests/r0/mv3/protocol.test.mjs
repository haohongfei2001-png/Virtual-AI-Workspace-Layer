import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroker, fixtureURL, senderIdentity, validRequest, validBoundReply, LEASE_MS } from '../../../experiments/r0/mv3/protocol.mjs';
const URL_A = 'http://127.0.0.1:38407/r0-mv3-fixture/A.html';
const URL_B = 'http://127.0.0.1:38407/r0-mv3-fixture/B.html';
const sender = overrides => ({ id: 'extension-id', tab: { id: 1 }, frameId: 0, documentId: 'doc-A',
  documentLifecycle: 'active', url: URL_A, ...overrides });
const request = overrides => ({ v: 1, type: 'BIND', clientId: 'client-A', requestId: 1, ...overrides });
function broker(options = {}) {
  let time = 1000, n = 0;
  return { api: createBroker({ extensionId: 'extension-id', workerId: 'worker-A', now: () => time, makeId: () => 'lease-' + ++n, ...options }),
    time: value => { time = value; } };
}
test('canonical loopback fixture only; normalized paths/credentials/external hosts are refused', () => {
  assert.equal(fixtureURL(URL_A), URL_A);
  for (const bad of ['https://chatgpt.com/c/a', URL_A+'?x=1', URL_A+'#x', URL_A+'?', ' '+URL_A,
    URL_A.replace('127.0.0.1','localhost'), URL_A.replace('/A.html','/x/../A.html'),
    URL_A.replace('/A.html','/%41.html'), URL_A.replace('http://','http://u:p@'), URL_A.replace('A.html','index.html')])
    assert.equal(fixtureURL(bad), null, bad);
});
test('MessageSender identity excludes frames, foreign extension, inactive/missing docs and unsafe tabs', () => {
  assert.equal(senderIdentity(sender(), 'extension-id').documentId, 'doc-A');
  for (const bad of [null, sender({ id:'other' }), sender({ frameId:1 }), sender({ documentId:null }),
    sender({ documentLifecycle:'cached' }), sender({ tab:{id:-1} }), sender({ url:URL_A+'#x' })])
    assert.equal(senderIdentity(bad,'extension-id'), null);
});
test('exact bounded schema rejects payload authority, extras, malformed IDs and operations', () => {
  assert.equal(validRequest(request()), true);
  for (const bad of [null, [], request({ scope:'account' }), request({ execute:'native-write' }), request({type:'RELEASE'}),
    request({v:2}), request({requestId:0}), request({requestId:Number.MAX_SAFE_INTEGER+1}),
    request({clientId:'x'.repeat(81)}), request({clientId:'<script>'})]) assert.equal(validRequest(bad), false);
});
test('positive bound reply survives structured clone; no object-identity token claim', () => {
  const {api} = broker(); const req=request(); const reply=api.handle(req,sender());
  assert.equal(validBoundReply(structuredClone(reply),req,URL_A,1000),true);
  for (const bad of [{...reply,documentId:null},{...reply,url:URL_B},{...reply,requestId:2},
    {...reply,expiresAt:1000},{...reply,expiresAt:1000+LEASE_MS+1},{...reply,extra:true}])
    assert.equal(validBoundReply(bad,req,URL_A,1000),false);
});
test('duplicate or reordered binds cannot renew a lease; explicit later request can bind again', () => {
  const {api}=broker(); const first=api.handle(request(),sender());
  assert.equal(api.handle(request(),sender()).reason,'occupied-or-replayed');
  const second=api.handle(request({requestId:2}),sender());
  assert.equal(second.ok,true); assert.notEqual(second.leaseId,first.leaseId);
  assert.equal(api.handle(request(),sender()).ok,false);
});
test('same-tab new document/client/url cannot evict an unexpired owner', () => {
  const {api,time}=broker(); api.handle(request(),sender());
  for(const [req,from] of [[request({clientId:'client-B'}),sender()],
    [request(),sender({documentId:'doc-B'})],[request(),sender({url:URL_B})]])
    assert.equal(api.handle(req,from).reason,'occupied-or-replayed');
  time(1000+LEASE_MS);
  assert.equal(api.handle(request({clientId:'client-B'}),sender({documentId:'doc-B',url:URL_B})).ok,true);
});
test('tab isolation; CHECK must match complete sender, client, worker, lease and monotonic request', () => {
  const {api}=broker();const first=api.handle(request(),sender());
  assert.equal(api.handle(request(),sender({tab:{id:2}})).ok,true);
  const check={v:1,type:'CHECK',clientId:'client-A',requestId:2,workerId:first.workerId,leaseId:first.leaseId};
  for(const patch of [{workerId:'old'},{leaseId:'old'},{clientId:'other'}])
    assert.equal(api.handle({...check,...patch},sender()).ok,false);
  assert.equal(api.handle(check,sender({documentId:'doc-B'})).ok,false);
  assert.equal(api.handle(check,sender()).ok,true);
  assert.equal(api.handle(check,sender()).ok,false);
});
test('simulated new broker boot loses leases; old CHECK is denied, new bind gets fresh boot identity', () => {
  const old=broker().api.handle(request(),sender()); const {api}=broker({workerId:'worker-B'});
  assert.equal(api.handle({v:1,type:'CHECK',clientId:'client-A',requestId:2,workerId:old.workerId,leaseId:old.leaseId},sender()).ok,false);
  assert.equal(api.handle(request({requestId:3}),sender()).workerId,'worker-B');
});
test('expiry rejects CHECK and frees bounded capacity; old commands never release a new owner', () => {
  const {api,time}=broker({maxSlots:1}); const old=api.handle(request(),sender());
  assert.equal(api.handle(request(),sender({tab:{id:2}})).reason,'capacity');
  time(1000+LEASE_MS);
  assert.equal(api.handle({v:1,type:'CHECK',clientId:'client-A',requestId:2,workerId:old.workerId,leaseId:old.leaseId},sender()).ok,false);
  const next=api.handle(request({clientId:'client-B'}),sender({documentId:'doc-B'}));assert.equal(next.ok,true);
  assert.equal(api.handle(request({type:'RELEASE'}),sender()).ok,false);
  assert.equal(api.handle({v:1,type:'CHECK',clientId:'client-B',requestId:2,workerId:next.workerId,leaseId:next.leaseId},sender({documentId:'doc-B'})).ok,true);
});
test('invalid clock/id factory or thrown field accessor fails closed without leaking exception', () => {
  assert.equal(broker({now:()=>NaN}).api.handle(request(),sender()).ok,false);
  assert.equal(broker({makeId:()=>''}).api.handle(request(),sender()).ok,false);
  assert.equal(broker({makeId:()=>{throw Error('test');}}).api.handle(request(),sender()).ok,false);
  const bad={get id(){throw Error('test');}};assert.equal(broker().api.handle(request(),bad).reason,'broker-error');
});

