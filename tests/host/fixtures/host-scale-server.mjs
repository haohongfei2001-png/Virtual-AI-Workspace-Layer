/** Native application-owned scale world. Never writes an extension DB or grant. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {hostScaleScenario,hostScaleRows} from './host-scale-world.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function createHostScaleServer(input={}){
 const scenario=hostScaleScenario(input),rows=[...hostScaleRows(scenario)],byId=new Map(rows.map(row=>[row.id,row])),projects=new Map();
 for(const row of rows)if(row.project&&!projects.has(row.project))projects.set(row.project,{id:row.project,name:'原生项目 '+projects.size});
 const projectHref=id=>'/g/'+id+'/project',firstProject=projects.values().next().value;
 const source=await readFile(new URL('legacy.html',import.meta.url),'utf8');
 const html=source.replace(/<section aria-label="Projects">[\s\S]*?<\/section>/,'<section aria-label="Projects"><h2>Projects</h2>'+[...projects.values()].map(p=>`<a href="${projectHref(p.id)}">${escape(p.name)}</a>`).join('')+'<button class="project-entry">Open first project</button></section>').replace(/<nav aria-label="Chat history">[\s\S]*?<\/nav>/,'<nav aria-label="Chat history"><h2>Chats</h2>'+rows.map(row=>`<a href="/c/${row.id}">${escape(row.title)}</a>`).join('')+'</nav>');
 // Scale application's own native layout keeps all project links in a real scroll region.
 const scaleCSS=Buffer.concat([await readFile(new URL('native.css',import.meta.url)),Buffer.from('\naside section[aria-label="Projects"]{min-height:0;max-height:30vh;overflow:auto;flex-shrink:0}aside nav[aria-label="Chat history"]{min-height:0}\n')]);
 const files=new Map([['/',{body:html,mime:'text/html'}],['/native.mjs',{body:await readFile(new URL('native.mjs',import.meta.url)),mime:'text/javascript'}],['/native.css',{body:scaleCSS,mime:'text/css'}]]);
 const cookie=randomBytes(24).toString('hex'),token='fixture-only-'+randomBytes(24).toString('hex'),principal='user-host-scale',requests={},actions={};
 const authorized=req=>(req.headers.cookie??'').split(';').some(x=>x.trim()==='host_scale_session='+cookie);
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const route=path=>{
  if(path==='/')return {title:'New chat',text:'Offline scale reconstruction only.'};
  const project=/^\/g\/([^/]+)\/project$/.exec(path),p=project&&projects.get(project[1]);
  if(p)return {title:p.name,project:p,conversations:rows.filter(row=>row.project===p.id).map(({id,title})=>({id,title,href:'/c/'+id}))};
  const match=/^\/c\/([a-f0-9-]+)$/.exec(path),row=match&&byId.get(match[1]);
  return row?{title:row.title,conversationId:row.id,text:'Offline scale conversation.'}:null;
 };
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  // Fixed buckets: never retain one trace entry per native record.
  const bucket=/^\/c\//.test(url.pathname)?'/c/:id':/^\/g\//.test(url.pathname)?'/g/:id':/^\/backend-api\/conversation\//.test(url.pathname)?'/backend-api/conversation/:id':url.pathname;
  if(Object.hasOwn(requests,bucket)||Object.keys(requests).length<32)requests[bucket]=(requests[bucket]??0)+1;
  if(req.method==='GET'&&(files.has(url.pathname)||route(url.pathname))){const file=files.get(url.pathname)??files.get('/');res.writeHead(200,{'Content-Type':file.mime+'; charset=utf-8','Cache-Control':'no-store',...(file.mime==='text/html'?{'Set-Cookie':`host_scale_session=${cookie}; HttpOnly; SameSite=Lax; Path=/`}:{})});res.end(file.body);return;}
  if(!authorized(req))return json(res,401,{error:'unauthenticated'});
  if(req.method==='GET'&&url.pathname==='/api/auth/session')return json(res,200,{user:{id:principal},expires:new Date(Date.now()+3600000).toISOString(),accessToken:token});
  if(req.method==='GET'&&url.pathname==='/backend-api/accounts/check/v4-2023-04-27')return req.headers.authorization===`Bearer ${token}`?json(res,200,{accounts:{'account-host-scale':{account:{account_id:'account-host-scale',name:'Personal',plan_type:'free',structure:'personal'}}},account_order:['account-host-scale']}):json(res,401,{error:'unauthenticated'});
  if(req.method==='GET'&&url.pathname==='/native/route'){const view=route(url.searchParams.get('path'));return json(res,view?200:404,view??{error:'not-found'});}
  if(req.method==='GET'&&url.pathname==='/backend-api/conversations'){
   const query=(url.searchParams.get('query')??'').toLowerCase(),matches=rows.filter(row=>row.title.toLowerCase().includes(query));
   return json(res,200,{items:matches.slice(0,28).map(({id,title})=>({id,title})),total:matches.length,offset:0,limit:28});
  }
  if(req.method==='GET'&&url.pathname==='/native/move-menu'){
   const row=byId.get(url.searchParams.get('conversation'));if(!row)return json(res,404,{error:'not-found'});
   return json(res,200,{conversationId:row.id,items:[{label:'No project',selected:row.project===null},...[...projects.values()].map(p=>({label:p.name,selected:row.project===p.id}))]});
  }
  if(req.method==='GET'&&/^\/backend-api\/conversation\//.test(url.pathname)){
   if(req.headers.authorization!==`Bearer ${token}`)return json(res,401,{error:'unauthenticated'});
   const row=byId.get(url.pathname.split('/').at(-1));return json(res,row?200:404,row?{conversation_id:row.id,mapping:{}}:{error:'not-found'});
  }
  if(req.method==='POST'&&url.pathname==='/native/action'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'too-large'});}
   const value=JSON.parse(body),allowed=['navigate','new-chat','open-project-button','search','model','tools','account','send-intent','new-project'];
   if(!allowed.includes(value.kind))return json(res,400,{error:'unsupported-scale-action'});
   actions[value.kind]=(actions[value.kind]??0)+1;return json(res,200,value.kind==='open-project-button'?{href:projectHref(firstProject.id)}:{ok:true});
  }
  json(res,404,{error:'not-found'});
 }catch{if(!res.headersSent)json(res,400,{error:'invalid-request'});else res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,url:origin+'/',scenario,snapshot:()=>structuredClone({nativeConversations:rows.length,nativeProjects:projects.size,requests,actions}),close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
