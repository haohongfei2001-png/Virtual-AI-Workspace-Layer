/** Test-only server. The normal simulator does NOT expose tests or a database control API. */
import { createServer } from '../../simulator/server.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const server=createServer(),normal=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(!path.startsWith('/__b23tests__/'))return normal(req,res);
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const file=path.slice('/__b23tests__/'.length);
 if(file==='approved.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(fileURLToPath(new URL('../../design/approved/v2.7/VAIWL_v2.7/prototype-v2.7.html',import.meta.url))));return;}
 if(file==='native.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><meta charset="utf-8"><title>B23 native IndexedDB tests — synthetic only</title><h1>Native IndexedDB test run</h1><pre id="result">RUNNING</pre><script type="module" src="/__/unused"></script>'.replace('/__/unused','/__b23tests__/native-db-entry.mjs'));return;}
 if(!['native-db-entry.mjs','contracts.mjs','native-incremental-cases.mjs','b5-cases.mjs','c34-cases.mjs'].includes(file)){res.writeHead(404);res.end();return;}
 try{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(fileURLToPath(new URL(file,import.meta.url))));}catch{res.writeHead(404);res.end();}
});
server.listen(Number(process.env.PORT||48173),'127.0.0.1',()=>console.log('B23 native test server ready'));
