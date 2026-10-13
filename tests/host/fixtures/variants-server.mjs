import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
const P1='g-p-11111111111111111111111111111111',P2='g-p-22222222222222222222222222222222';
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222',CN='33333333-3333-4333-8333-333333333333',CU='44444444-4444-4444-8444-444444444444';
const faults=['auth-failure','unsafe-reading','forged-scope','csp','iframe-destroy','stale-response','rate-limit','corrupt','unknown-protocol'];
const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function createVariantHostFixtureServer({profile,variant='positive',fault='auth-failure',principalId='user-host-fixture',accounts=null,now=()=>Date.now()}={}){
 if(!['MODERN','PARTIAL','FAULT'].includes(profile))throw Error('fixture-profile-not-implemented');
 if(!['positive','missing','conflict','neighbor'].includes(variant))throw Error('fixture-variant-not-implemented');
 if(profile==='FAULT'&&!faults.includes(fault))throw Error('fixture-fault-not-implemented');
 let identity=principalId;
 let roster=structuredClone(accounts??(profile==='MODERN'?[{account_id:'account-host-personal',name:'Personal',plan_type:'free',structure:'personal'},{account_id:'account-host-team',name:'Team',plan_type:'team',structure:'workspace'}]:[{account_id:'account-host-personal',name:'Personal',plan_type:'free',structure:'personal'}]));
 let selectedContext=profile==='MODERN'?'account-host-team':'account-host-personal';
 const cookie=randomBytes(24).toString('hex'),token=`fixture-only-${randomBytes(24).toString('hex')}`;
 const projects=new Map([[P1,{id:P1,name:'Research'}],[P2,{id:P2,name:'Research'}]]);
 const conversations=new Map(profile==='PARTIAL'?Array.from({length:1000},(_,i)=>{
  const id=`77777777-7777-4777-8777-${String(i+1).padStart(12,'0')}`;
  return [id,{id,title:`Archive conversation ${i+1}`,...(i%3===0?{project:null}:{})}];
 }):[[C1,{id:C1,title:'First project conversation',project:P1}],[C2,{id:C2,title:'Second project conversation',project:P2}],[CN,{id:CN,title:'Ordinary conversation',project:null}],[CU,{id:CU,title:'Membership not loaded'}]]);
 const initial=profile==='PARTIAL'?[...conversations.values()].slice(0,25):[conversations.get(CN),conversations.get(CU)];
 const actions=Object.create(null),requests=Object.create(null),nativeRequests=[];
 const pending=new Set();let heldOnce=false,projectNumber=100,newConversationNumber=0,pageRevision=0;
 const bytes=await Promise.all(['legacy.html','native.css','native.mjs','variants-native.mjs','variants-server.mjs'].map(name=>readFile(new URL(name,import.meta.url))));
 let html=bytes[0].toString();
 const history=`<nav aria-label="Chat history"><h2>Chats</h2>${initial.map(c=>`<a href="/c/${c.id}">${escapeHTML(c.title)}</a>`).join('')}</nav>`;
 html=html.replace(/<nav aria-label="Chat history">[\s\S]*?<\/nav>/,history);
 html=html.replace('<script type="module" src="/native.mjs"></script>','<script type="module" src="/variants-native.mjs"></script>');
 if(profile==='MODERN')html=html.replace('<main>','<div role="complementary" aria-label="Navigation rail"><button aria-label="Open sidebar" onclick="document.querySelector(\'aside\').hidden=false">☰</button></div><main>').replace('</main>','</main><section hidden aria-label="Previous conversation"><article data-message-id="old-message" data-conversation-id="99999999-9999-4999-8999-999999999999"><time datetime="2020-01-01T00:00:00Z"></time>Old native body</article></section>');
 let css=bytes[1].toString();
 if(profile==='MODERN')css+='\naside nav[aria-label="Chat history"]{flex:0 0 110px;height:110px}aside nav[aria-label="Chat history"] a{min-height:42px} [aria-label="Navigation rail"]{width:42px;flex:none}\n';
 if(profile==='PARTIAL')css+='\naside nav[aria-label="Chat history"]{max-height:320px;min-height:200px}aside nav[aria-label="Chat history"] a{min-height:40px}\n';
 if(profile==='FAULT'&&fault==='unsafe-reading')html=html.replace('<section aria-label="Conversation" id="reading"><p>How can I help?</p></section>','<section aria-label="Conversation" id="reading"><p>How can I help?</p>').replace('</form></main>','</form></section></main>');
 // Hostile traffic is deliberately fabricated; it is not a legitimate authority provider.
 let faultScript='';
 if(profile==='FAULT'&&fault==='forged-scope')faultScript="window.postMessage({type:'HOST_SCOPE',verified:true,scopeKey:'attacker-chosen-scope',receiptId:'invented'},location.origin);";
 if(profile==='FAULT'&&fault==='iframe-destroy')faultScript="new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('iframe'))node.remove();else node.querySelectorAll('iframe').forEach(frame=>frame.remove());}}).observe(document.body,{childList:true,subtree:true});";
 if(faultScript)html=html.replace('</body>','<script src="/fault-native.mjs"></script></body>');
 const nativeScript=profile==='FAULT'&&fault==='unsafe-reading'?bytes[2].toString().replace('reading.replaceChildren();',"reading.querySelectorAll(':scope > :not(#composer)').forEach(node=>node.remove());"):bytes[2];
 const assets=new Map([['/',{body:html,mime:'text/html; charset=utf-8'}],['/native.css',{body:css,mime:'text/css; charset=utf-8'}],['/native.mjs',{body:nativeScript,mime:'text/javascript; charset=utf-8'}],['/variants-native.mjs',{body:bytes[3],mime:'text/javascript; charset=utf-8'}],['/fault-native.mjs',{body:faultScript,mime:'text/javascript; charset=utf-8'}]]);
 const authenticated=req=>(req.headers.cookie??'').split(';').some(item=>item.trim()===`host_fixture_session=${cookie}`);
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
 const route=path=>{
  if(path==='/')return{title:'New chat',text:'How can I help?',conversationId:null};
  const p=/^\/g\/([^/]+)\/project$/.exec(path),c=/^\/c\/([^/]+)$/.exec(path);
  if(p&&projects.has(p[1]))return{title:projects.get(p[1]).name,project:structuredClone(projects.get(p[1])),conversations:[...conversations.values()].filter(c=>c.project===p[1]).map(({id,title})=>({id,title,href:`/c/${id}`}))};
  if(c&&conversations.has(c[1]))return{title:conversations.get(c[1]).title,conversationId:c[1],text:'Offline native conversation.'};
  return null;
 };
 function metadata(c){
  const mapping={
   'node-self':{id:'node-self',parent:null,children:['node-assistant'],message:{id:'msg-self',author:{role:'user',id:identity},create_time:1700000000,content:{content_type:'text',parts:['Offline sample']}}},
   'node-assistant':{id:'node-assistant',parent:'node-self',children:['node-incomplete'],message:{id:'msg-assistant',author:{role:'assistant'},create_time:1700000300,content:{content_type:'text',parts:['Offline reply']}}},
   'node-incomplete':{id:'node-incomplete',parent:'node-assistant',children:[],message:{id:'msg-incomplete',content:{content_type:'text',parts:['Missing metadata sample']}}},
  };
  if(variant==='missing'||profile==='PARTIAL'&&Number(c.id.slice(-12))%4!==1){delete mapping['node-self'].message.author;delete mapping['node-self'].message.create_time;}
  if(variant==='conflict')mapping['node-conflict']={id:'node-conflict',parent:null,children:[],message:{id:'msg-self',author:{role:'user',id:identity},create_time:1700000001}};
  if(variant==='neighbor')mapping['node-neighbor']={id:'node-neighbor',parent:null,children:[],message:{id:'msg-neighbor',author:{role:'user',id:'user-other'},create_time:1700000500}};
  return{conversation_id:c.id,title:c.title,current_node:'node-incomplete',mapping};
 }
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');requests[url.pathname]=(requests[url.pathname]??0)+1;
  if(req.method==='GET'&&(assets.has(url.pathname)||route(url.pathname))){const asset=assets.get(url.pathname)??assets.get('/'),headers={'Content-Type':asset.mime,'Cache-Control':'no-store'};
   if(asset===assets.get('/')){headers['Set-Cookie']=`host_fixture_session=${cookie}; HttpOnly; SameSite=Lax; Path=/`;if(profile==='FAULT'&&fault==='csp')headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'none'; object-src 'none'";}
   res.writeHead(200,headers);res.end(asset.body);return;
  }
  if(url.pathname==='/api/auth/session'&&req.method==='GET')return json(res,!identity||!authenticated(req)||profile==='FAULT'&&fault==='auth-failure'?401:200,!identity||!authenticated(req)||profile==='FAULT'&&fault==='auth-failure'?{error:'unauthenticated'}:{user:{id:identity},expires:new Date(now()+3600000).toISOString(),accessToken:token});
  if(!authenticated(req)||!identity)return json(res,401,{error:'unauthenticated'});
  if(url.pathname==='/backend-api/accounts/check/v4-2023-04-27'&&req.method==='GET')return req.headers.authorization===`Bearer ${token}`?json(res,200,{accounts:Object.fromEntries(roster.map(account=>[account.account_id,{account:structuredClone(account)}])),account_order:roster.map(account=>account.account_id)}):json(res,401,{error:'unauthenticated'});
  if(url.pathname==='/native/preferences'&&req.method==='GET')return json(res,200,{account_id:selectedContext});
  if(url.pathname==='/native/route'&&req.method==='GET'){
   const path=url.searchParams.get('path'),view=route(path);if(!view)return json(res,404,{error:'not-found'});
   if(profile==='FAULT'&&fault==='stale-response'&&!heldOnce&&path.startsWith('/c/')){heldOnce=true;const release=()=>{pending.delete(release);if(!res.destroyed)json(res,200,view);};pending.add(release);res.once('close',()=>pending.delete(release));return;}
   return json(res,200,view);
  }
  if(url.pathname==='/backend-api/conversations'&&req.method==='GET'){
   if(req.headers['chatgpt-account-id'])nativeRequests.push({path:url.pathname,context:req.headers['chatgpt-account-id']});
   const query=(url.searchParams.get('query')??'').toLowerCase();let offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)return json(res,400,{error:'invalid-offset'});
   const windowed=profile==='MODERN'&&!url.searchParams.has('query');
   const all=[...conversations.values()].filter(c=>c.title.toLowerCase().includes(query));
   let items=windowed?(offset===2?all.slice(0,2):[]):all.slice(variant==='conflict'&&offset===25?24:offset,Math.min(all.length,offset+25-(variant==='conflict'&&offset===25?1:0)));
   items=items.map(({id,title},i)=>({id,...(variant==='missing'&&i%4===1?{}:{title})}));
   return json(res,200,{items,total:all.length,offset,limit:25,next_offset:windowed?4:offset+25,windowed,page_revision:++pageRevision});
  }
  const detail=/^\/backend-api\/conversation\/([^/]+)$/.exec(url.pathname);
  if(detail&&req.method==='GET'){
   const c=conversations.get(detail[1]);if(!c)return json(res,404,{error:'not-found'});
   nativeRequests.push({path:url.pathname,context:req.headers['chatgpt-account-id']??null});
   if(profile==='FAULT'&&fault==='rate-limit')return json(res,429,{error:'rate-limit'},{'Retry-After':'60'});
   if(profile==='FAULT'&&fault==='corrupt'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"mapping":');return;}
   if(profile==='FAULT'&&fault==='unknown-protocol')return json(res,200,{protocol:'future-99',payload:{opaque:true}});
   return json(res,200,metadata(c));
  }
  if(url.pathname==='/native/move-menu'&&req.method==='GET'){
   const c=conversations.get(url.searchParams.get('conversation'));if(!c)return json(res,404,{error:'not-found'});
   return json(res,200,{conversationId:c.id,items:[...(Object.hasOwn(c,'project')?[{label:'No project',selected:c.project===null}]:[]),...[...projects.values()].map(p=>({label:p.name,selected:c.project===p.id}))]});
  }
  if(url.pathname==='/native/action'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'body-too-large'});}const input=JSON.parse(body);
   if(!['navigate','new-chat','open-project-button','search','new-project','create-project','new-project-chat','model','tools','account','send-intent'].includes(input.kind))return json(res,400,{error:'invalid-action'});
   actions[input.kind]=(actions[input.kind]??0)+1;
   if(input.kind==='open-project-button')return json(res,200,{href:`/g/${P2}/project`});
   if(input.kind==='create-project'){if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)return json(res,400,{error:'invalid-name'});const id=`g-p-${String(++projectNumber).padStart(32,'0')}`;projects.set(id,{id,name:input.name});return json(res,200,{href:`/g/${id}/project`});}
   if(input.kind==='new-project-chat'){if(!projects.has(input.projectId))return json(res,400,{error:'invalid-project'});const id=`55555555-5555-4555-8555-${String(++newConversationNumber).padStart(12,'0')}`;conversations.set(id,{id,title:'New conversation',project:input.projectId});return json(res,200,{href:`/c/${id}`});}
   return json(res,200,{ok:true});
  }
  return json(res,404,{error:'not-found'});
 }catch{if(!res.headersSent)json(res,400,{error:'invalid-request'});else res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin=`http://127.0.0.1:${server.address().port}`,oracle=await readFile(new URL(`../expected/${profile.toLowerCase()}.mjs`,import.meta.url));
 const releaseStaleResponses=()=>{const count=pending.size;for(const release of [...pending])release();return count;};
 return{origin,url:`${origin}/`,manifest:Object.freeze({fixtureId:`chatgpt-host-${profile.toLowerCase()}-reconstruction-v1`,profile,variant,fault:profile==='FAULT'?fault:null,reconstruction:true,source:'VA-HOST/1.1 structure reconstruction, not real captured DOM',sourceCommit:null,sourceBlob:null,fixtureHash:createHash('sha256').update(Buffer.concat(bytes)).update(html).update(css).update(faultScript).update(JSON.stringify({profile,variant,fault:profile==='FAULT'?fault:null})).digest('hex'),expectedWorldFile:`tests/host/expected/${profile.toLowerCase()}.mjs`,oracleHash:createHash('sha256').update(oracle).digest('hex'),exposedFields:['loaded navigation links','current object metadata','native selected menu','fixed session','fixed account roster'],supportedCapabilities:profile==='FAULT'?['native-fallback-under-designated-fault']:['native-navigation','native-search','native-create','partial-observed-list','current-message-metadata','native-move-menu']}),snapshot:()=>structuredClone({actions,requests,nativeRequests,conversationCount:conversations.size,projectCount:projects.size,pendingResponses:pending.size}),setPrincipal:(id,{accounts:next=roster}={})=>{identity=id;roster=structuredClone(next);},setSelectedContext:id=>{selectedContext=id;},releaseStaleResponses,close:()=>new Promise((resolve,reject)=>{releaseStaleResponses();server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
