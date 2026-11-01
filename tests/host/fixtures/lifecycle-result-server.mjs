import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createVariantHostFixtureServer} from './variants-server.mjs';
import {sys05UpstreamURL} from './sys05-stream-server.mjs';
const targetId='33333333-3333-4333-8333-333333333333';
// Independent server ledger is authoritative only for this fictional fixture.
// It never writes the extension database; retained DOM is intentionally stale.
export async function createLifecycleResultServer(){
 const upstream=await createVariantHostFixtureServer({profile:'MODERN'}),script=await readFile(new URL('./lifecycle-native.mjs',import.meta.url));
 let cookie=null,exists=true,version=0,deletion=null;const ledger=new Map(),reads=[],held=new Map();
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const auth=req=>cookie&&(req.headers.cookie??'').split(';').some(v=>v.trim()===cookie);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/lifecycle-native.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(script);return;}
  const action=/^\/native\/lifecycle\/action\/(cancel|http-only|wrong-target|delete|restore)$/.exec(req.url);
  const read=/^\/native\/lifecycle\/result\/(cancel|http-only|wrong-target|delete|restore)$/.exec(req.url);
  if(action||read){
   if(!auth(req))return json(res,401,{error:'unauthenticated'});
   if(read&&req.method==='GET'){reads.push(read[1]);return json(res,ledger.has(read[1])?200:404,ledger.get(read[1])??{error:'missing'});}
   if(!action||req.method!=='POST')return json(res,405,{error:'method'});
   const op=action[1];if(ledger.has(op))return json(res,409,{error:'already-consumed'});
   const resultId='result_'+randomBytes(16).toString('hex');
   if(op==='delete'){if(!exists)return json(res,409,{error:'absent'});exists=false;version++;deletion=resultId;}
   if(op==='restore'){if(exists||!deletion)return json(res,409,{error:'no-deletion'});exists=true;version++;}
   const value=op==='http-only'?{ok:true}:{principalId:'user-host-fixture',contextId:'account-host-team',kind:'refs',targetId:op==='wrong-target'?'44444444-4444-4444-8444-444444444444':targetId,
    operationId:op,resultId,state:op==='cancel'?'cancelled':op==='restore'?'restored':'deleted',version:Math.max(1,version),coversDeleteResultId:op==='restore'?deletion:null};
   ledger.set(op,value);if(op==='delete'||op==='restore'){held.set(op,res);return;}return json(res,200,{operationId:op});
  }
  let target;try{target=sys05UpstreamURL(req.url,upstream.origin);}catch{return json(res,400,{error:'path'});}
  const forwarded=http.request(target,{method:req.method,headers:{...req.headers,host:new URL(upstream.origin).host}},reply=>{
   const set=reply.headers['set-cookie']?.find(v=>v.startsWith('host_fixture_session='));if(set)cookie=set.split(';')[0];
   if(req.method==='GET'&&url.pathname==='/native.mjs'){
    const chunks=[];reply.on('data',c=>chunks.push(c));reply.on('end',()=>{res.writeHead(reply.statusCode,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(Buffer.concat(chunks).toString()+"\nawait import('/lifecycle-native.mjs');\n");});
   }else{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);}
  });forwarded.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(forwarded);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {origin:'http://127.0.0.1:'+server.address().port,snapshot:()=>structuredClone({exists,version,ledger:Object.fromEntries(ledger),reads,held:[...held.keys()]}),
  release(operation){const res=held.get(operation);if(!res)throw Error('missing-held-native-result');held.delete(operation);json(res,200,{operationId:operation});},
  async close(){for(const res of held.values())res.destroy();held.clear();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await upstream.close();}};
}
