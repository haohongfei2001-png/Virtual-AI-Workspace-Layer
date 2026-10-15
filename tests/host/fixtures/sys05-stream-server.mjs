import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createVariantHostFixtureServer} from './variants-server.mjs';

// Test-only same-origin façade: all authentication, context, POST acceptance and
// metadata remain in the existing MODERN/J4 native reconstruction, unchanged.
export function addSys05NativeStream(source){
 const marker='if(reply.title){';
 if(source.split(marker).length!==2)throw Error('sys05-native-joint-boundary-changed');
 return source.replace(marker,'globalThis.sys05NativeStream?.jointTick();'+marker)+"\nawait import('/sys05-native-stream.mjs');\n";
}
// This test profile has the existing J2 ACK-only semantics for NEW rows. The
// server still accepts the real POST; the old 90-day row retains original time.
// Omission cannot manufacture a receipt, author, acceptance or timestamp.
export function sys05AckOnlyMetadata(value){
 if(value?.conversation_id!=='44444444-4444-4444-8444-444444444444'||!value.mapping?.j4_original_old)throw Error('sys05-metadata-profile-drift');
 const copy=structuredClone(value);
 // The composed native application owns one stable assistant row from startup.
 // Its displayed successor is the actual accepted J4 POST row, not a second ACK.
 copy.mapping['sys05-assistant']={id:'sys05-assistant',parent:'j4_original_old',message:{id:'sys05-assistant',author:{role:'assistant'},content:{parts:['Offline assistant output']}}};
 for(const row of Object.values(copy.mapping))if(row.id!=='sys05-assistant'&&row.parent==='j4_original_old')row.parent='sys05-assistant';
 for(const row of Object.values(copy.mapping))if(row.message?.id!=='j4_original_old'){delete row.message.original_send;delete row.message.create_time;}
 return copy;
}
export function sys05UpstreamURL(requestPath,fixedOrigin){
 const base=new URL(fixedOrigin);
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.origin!==fixedOrigin||typeof requestPath!=='string'||!requestPath.startsWith('/')||requestPath.startsWith('//')||/[\\\x00-\x20]/.test(requestPath))throw Error('sys05-fixed-fixture-path-required');
 const target=new URL(requestPath,base);if(target.origin!==base.origin)throw Error('sys05-fixed-fixture-origin-required');return target;
}
export async function createSys05StreamServer(){
 const upstream=await createVariantHostFixtureServer({profile:'MODERN',journey:'J4',interruption:true});
 const stream=await readFile(new URL('./sys05-native-stream.mjs',import.meta.url));
 const reads=[];let dropped=0;
 const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/sys05-native-stream.mjs'){
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(stream);return;
  }
  let target;try{target=sys05UpstreamURL(req.url,upstream.origin);}catch{res.writeHead(400);res.end('invalid-fixture-path');return;}
  const path=target.pathname;
  const fixed=req.method==='GET'&&(path==='/api/auth/session'||path==='/backend-api/accounts/check/v4-2023-04-27'||path.startsWith('/backend-api/conversation/'));
  const row=fixed?{path,at:Date.now(),finishedAt:null,status:null,authenticated:typeof req.headers.authorization==='string',context:['account-host-personal','account-host-team'].includes(req.headers['chatgpt-account-id'])?req.headers['chatgpt-account-id']:null}:null;
  if(row){if(reads.length<512)reads.push(row);else dropped++;}
  const forwarded=http.request(target,{method:req.method,headers:{...req.headers,host:new URL(upstream.origin).host}},response=>{
   if(row){row.status=response.statusCode;res.once('finish',()=>row.finishedAt=Date.now());}
   if(req.method==='GET'&&path==='/backend-api/conversation/44444444-4444-4444-8444-444444444444'&&response.statusCode===200){
    const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{try{const body=JSON.stringify(sys05AckOnlyMetadata(JSON.parse(Buffer.concat(chunks).toString())));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('fixture-metadata-transform-failed');}});
   }else if(req.method==='GET'&&path==='/native.mjs'){
    const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{try{const body=addSys05NativeStream(Buffer.concat(chunks).toString());res.writeHead(response.statusCode,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('fixture-transform-failed');}});
   }else{res.writeHead(response.statusCode,response.headers);response.pipe(res);}
  });
  forwarded.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(forwarded);
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
 catch(error){await upstream.close();throw error;}
 return {origin:`http://127.0.0.1:${server.address().port}`,snapshot:()=>({...upstream.snapshot(),sys05Reads:structuredClone(reads),readTraceDropped:dropped}),async close(){await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});await upstream.close();}};
}
