import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function createFixtureServer({fontPath=process.env.PRO_CJK_FONT}={}) {
 return createServer(async(req,res)=>{try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname==='/'?'/tests/pro/demo.html':decodeURIComponent(url.pathname);
  const path=name==='/__fixture-font.ttf'&&fontPath?fontPath:resolve(repository,'.'+name);
  if(name==='/__fixture-font.ttf'&&!fontPath){res.writeHead(204).end();return;}
  if(path!==fontPath&&!path.startsWith(repository+'/')){res.writeHead(403).end();return;}
  const mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.json':'application/json','.ttf':'font/ttf','.png':'image/png'}[extname(path)]??'application/octet-stream';
  let bytes=await readFile(path);
  // A declared @font-face with an empty 204 response is a failed font, not a
  // system-font fallback: document.fonts.load() rejects in Chromium. Keep the
  // documented no-font fixture runnable without weakening browser assertions.
  if(!fontPath&&extname(path)==='.html')bytes=Buffer.from(bytes.toString('utf8').replace(/@font-face\{[^}]*url\('\/__fixture-font\.ttf'\)[^}]*\}/g,''));
  res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'none'");
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404).end();}});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT??4173),server=createFixtureServer();server.listen(port,'127.0.0.1',()=>process.stdout.write('VAIWL Pro isolated fixture: http://127.0.0.1:'+server.address().port+'\n'));}
