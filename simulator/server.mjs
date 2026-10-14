import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||48173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid-port');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
export function createServer(){return http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(path==='/'||path==='/control.html')path='/simulator/control.html';
  else if(/^\/hf\/(A|B|unknown)\/(c\/[A-Za-z0-9_-]+|project\/[A-Za-z0-9_-]+|new)$/.test(path))path='/simulator/index.html';
  if(path!=='/src/runtime/free-read-service.mjs'&&path!=='/src/host/frame-resume-state.mjs'&&!/^\/(simulator|src\/b1|src\/navigation|src\/data)\//.test(path))throw Error('not-found');
  const target=resolve(root,'.'+path);if(!target.startsWith(root+sep)||!mime[extname(target)])throw Error('not-found');
  const content=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:content);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createServer();server.listen(port,'127.0.0.1',()=>console.log(`Synthetic host only: http://127.0.0.1:${port}/control.html`));}
