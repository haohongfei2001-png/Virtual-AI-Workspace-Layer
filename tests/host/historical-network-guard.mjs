import {createServer} from 'node:http';

// Test-only URL-network guard for a new disposable Chrome profile. This is NOT
// an OS firewall. Do not apply to a system proxy, user profile, or user device.
// Chromium semantics: https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md
function port(value){
 if(!Number.isInteger(value)||value<1||value>65535)throw Error('invalid-network-guard-port');
 return value;
}
function fixture(value){
 if(typeof value!=='string'||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value))throw Error('invalid-network-guard-fixture-origin');
 port(Number(new URL(value).port));
 return value;
}
export function historicalNetworkGuardArgs(config){
 if(!config||Object.keys(config).sort().join(',')!=='fixtureOrigin,proxyPort')throw Error('invalid-network-guard-config');
 const origin=fixture(config.fixtureOrigin),proxyPort=port(config.proxyPort);
 if(Number(new URL(origin).port)===proxyPort)throw Error('network-guard-port-collision');
 return Object.freeze([
  `--proxy-server=http://127.0.0.1:${proxyPort}`,
  // Order is important: remove implicit localhost/link-local exceptions first.
  `--proxy-bypass-list=<-loopback>;${origin}`,
  '--disable-quic',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
 ]);
}
const safeMethods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','CONNECT']);
function safeHost(req){
 try{
  const u=new URL(req.method==='CONNECT'?`http://${req.url}`:req.url);
  return /^(?:[a-z0-9.-]{1,253}|\[[a-f0-9:]{2,45}\])$/i.test(u.hostname)?u.hostname.toLowerCase():'invalid';
 }catch{return 'invalid';}
}
export async function createHistoricalNetworkGuard({fixtureOrigin}){
 fixtureOrigin=fixture(fixtureOrigin);
 const sockets=new Set(),counts=new Map();let total=0,closed=false,closePromise;
 const record=req=>{
  total++;
  const key=`${safeMethods.has(req.method)?req.method:'OTHER'} ${safeHost(req)}`;
  const bucket=counts.has(key)||counts.size<128?key:'OTHER overflow';
  counts.set(bucket,(counts.get(bucket)??0)+1);
 };
 const rejectSocket=(req,socket)=>{
  record(req);
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
 };
 const server=createServer({maxHeaderSize:8192},(req,res)=>{
  record(req);res.writeHead(403,{'Connection':'close','Content-Length':'0'});res.end();
 });
 // No forwarding code, DNS lookup, outbound socket, or destination request.
 server.on('connect',rejectSocket);server.on('upgrade',rejectSocket);
 server.on('checkContinue',(req,res)=>{record(req);res.writeHead(403,{'Connection':'close','Content-Length':'0'});res.end();});
 server.on('checkExpectation',(req,res)=>{record(req);res.writeHead(403,{'Connection':'close','Content-Length':'0'});res.end();});
 server.on('clientError',(_error,socket)=>socket.destroy());
 server.on('connection',socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.setTimeout(2000,()=>socket.destroy());});
 server.requestTimeout=2000;server.headersTimeout=2000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 const config=Object.freeze({fixtureOrigin,proxyPort:server.address().port});
 try{historicalNetworkGuardArgs(config);}catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
 return Object.freeze({
  config,
  snapshot:()=>({mode:'DISPOSABLE_CHROME_REJECT_PROXY',closed,denied:total,counts:Object.fromEntries(counts)}),
  close(){
   if(!closePromise){closed=true;closePromise=new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());for(const socket of sockets)socket.destroy();});}
   return closePromise;
  },
 });
}
