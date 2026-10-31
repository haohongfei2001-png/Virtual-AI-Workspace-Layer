import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import {createServer} from 'node:http';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
function exchange(port,payload){return new Promise((resolve,reject)=>{const s=createConnection({host:'127.0.0.1',port});let data='';s.setTimeout(3000,()=>s.destroy(Error('timeout')));s.on('error',reject);s.on('connect',()=>s.write(payload));s.on('data',chunk=>data+=chunk);s.on('end',()=>resolve(data));});}
test('only exact HTTP fixture is bypassed, implicit exceptions removed, no DIRECT fallback',()=>{
 const args=historicalNetworkGuardArgs({fixtureOrigin:'http://127.0.0.1:41234',proxyPort:41235});
 assert.deepEqual(args,['--proxy-server=http://127.0.0.1:41235','--proxy-bypass-list=<-loopback>;http://127.0.0.1:41234','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']);
 assert(Object.isFrozen(args));
});
test('rejects untrusted flag injection, expanded bypass, and invalid ports',()=>{
 for(const fixtureOrigin of ['http://localhost:1234','http://127.0.0.2:1234','https://127.0.0.1:1234','http://127.0.0.1:80','http://127.0.0.1:1234/','http://127.0.0.1:1234;*','http://user@127.0.0.1:1234','http://127.0.0.1:0','http://127.0.0.1:65536'])assert.throws(()=>historicalNetworkGuardArgs({fixtureOrigin,proxyPort:1235}));
 for(const proxyPort of [0,-1,65536,1.5,'1235;direct://',NaN])assert.throws(()=>historicalNetworkGuardArgs({fixtureOrigin:'http://127.0.0.1:1234',proxyPort}));
 assert.throws(()=>historicalNetworkGuardArgs({fixtureOrigin:'http://127.0.0.1:1234',proxyPort:1234}));
 assert.throws(()=>historicalNetworkGuardArgs({fixtureOrigin:'http://127.0.0.1:1234',proxyPort:1235,args:['--no-proxy-server']}));
});
test('HTTP, CONNECT, websocket upgrades and Expect denied without touching target; logs omit secrets',async()=>{
 let targetHits=0;const target=createServer((_req,res)=>{targetHits++;res.end('UNEXPECTED');});
 await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const targetPort=target.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:`http://127.0.0.1:${targetPort}`});
 try{
  const requests=[
   `GET http://user:password@127.0.0.1:${targetPort}/secret?token=hidden HTTP/1.1\r\nHost: ignored.example\r\nCookie: session=secret\r\n\r\n`,
   `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: ignored.example\r\n\r\n`,
   `GET http://127.0.0.1:${targetPort}/secret HTTP/1.1\r\nHost: ignored.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
   'POST http://example.invalid/secret HTTP/1.1\r\nHost: example.invalid\r\nExpect: 100-continue\r\nContent-Length: 12\r\n\r\n',
   'GET /secret?token=hidden HTTP/1.1\r\nHost: secret.example\r\n\r\n',
  ];
  for(const request of requests)assert.match(await exchange(guard.config.proxyPort,request),/^HTTP\/1\.1 403 Forbidden/);
  assert.equal(targetHits,0);assert.equal(guard.snapshot().denied,5);
  assert.deepEqual(guard.snapshot().counts,{'GET 127.0.0.1':2,'CONNECT 127.0.0.1':1,'POST example.invalid':1,'GET invalid':1});
  assert.doesNotMatch(JSON.stringify(guard.snapshot()),/password|token|hidden|secret|Cookie|session|ignored/);
  const snap=guard.snapshot();snap.counts['GET invalid']=99;assert.equal(guard.snapshot().counts['GET invalid'],1);
 }finally{await guard.close();await guard.close();await new Promise(r=>target.close(r));}
 assert.equal(guard.snapshot().closed,true);
 await assert.rejects(exchange(guard.config.proxyPort,'GET / HTTP/1.1\r\n\r\n'));
});
test('close destroys incomplete requests without hanging',async()=>{
 const guard=await createHistoricalNetworkGuard({fixtureOrigin:'http://127.0.0.1:41234'});
 const socket=createConnection({host:'127.0.0.1',port:guard.config.proxyPort});socket.on('error',()=>{});
 await new Promise(r=>socket.once('connect',r));socket.write('GET ');await guard.close();socket.destroy();
});
test('diagnostics have bounded host cardinality and unsupported Expect is denied',async()=>{
 const guard=await createHistoricalNetworkGuard({fixtureOrigin:'http://127.0.0.1:41234'});
 try{
  for(let i=0;i<132;i++)assert.match(await exchange(guard.config.proxyPort,`GET http://host-${i}.invalid/private HTTP/1.1\r\nHost: unused\r\n\r\n`),/^HTTP\/1\.1 403/);
  assert.match(await exchange(guard.config.proxyPort,'POST http://example.invalid/private HTTP/1.1\r\nHost: example.invalid\r\nExpect: unknown\r\nContent-Length: 3\r\n\r\n'),/^HTTP\/1\.1 403/);
  assert.equal(guard.snapshot().denied,133);assert.equal(Object.keys(guard.snapshot().counts).length,129);assert.equal(guard.snapshot().counts['OTHER overflow'],5);
 }finally{await guard.close();}
});
