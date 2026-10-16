import {createJ2SendFixture,j2Native,J2_C} from './j2-send.mjs';
import {createFirstSendFixture,firstSendNative} from './first-send.mjs';
import { j1CandidatePage, j1NativeProjects } from './j1-candidate-page.mjs';
import { createVariantHostFixtureServer } from './variants-server.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';

const PROJECT_ONE = 'g-p-11111111111111111111111111111111';
const PROJECT_TWO = 'g-p-22222222222222222222222222222222';
const C_ONE = '11111111-1111-4111-8111-111111111111';
const C_TWO = '22222222-2222-4222-8222-222222222222';
const C_NONE = '33333333-3333-4333-8333-333333333333';
const C_UNKNOWN = '44444444-4444-4444-8444-444444444444';
const DEFAULT_ACCOUNT = 'account-host-personal';
const clone = (value) => structuredClone(value);

/**
 * Loopback-only native application reconstruction, NOT a captured ChatGPT page.
 * Authentication and expected results never come from page-supplied verified flags.
 * LEGACY keeps its original behavior; other profiles use their own reconstruction.
 */
export async function createHostFixtureServer({profile = 'LEGACY', principalId = 'user-host-fixture', accounts = null, now = () => Date.now(), variant = 'positive', fault, journey = null, j3Layout = 'direct'} = {}) {
  if(!['direct','app-root'].includes(j3Layout)||j3Layout!=='direct'&&(profile!=='LEGACY'||journey!=='J3'))throw Error('invalid-fixture-j3-layout');
  if(journey!==null&&(!['J1','J2','J3','FIRST_SEND'].includes(journey)||profile!=='LEGACY'))throw Error('invalid-fixture-journey');
  if (profile !== 'LEGACY') return createVariantHostFixtureServer({profile,principalId,accounts,now,variant,fault});
  const files = Object.fromEntries(await Promise.all([
    ['/', 'legacy.html', 'text/html; charset=utf-8'],
    ['/native.mjs', 'native.mjs', 'text/javascript; charset=utf-8'],
    ['/native.css', 'native.css', 'text/css; charset=utf-8'],
  ].map(async ([url, file, mime]) => [url, {body: await readFile(new URL(file, import.meta.url)), mime}])));
  if(journey==='J2')files['/native.mjs'].body=Buffer.from(j2Native(files['/native.mjs'].body.toString()));
  if(journey==='FIRST_SEND')files['/native.mjs'].body=Buffer.from(firstSendNative(files['/native.mjs'].body.toString()));
  if(journey==='J1')files['/'].body=Buffer.from(j1CandidatePage(files['/'].body.toString()));
  if(journey==='J3')files['/'].body=Buffer.from(files['/'].body.toString().replace('<textarea id="prompt-textarea"','<textarea data-j3-editor="plain" id="prompt-textarea"').replace('<!-- J3_EDITOR -->','<button type="button" id="editor-mode">Use contenteditable</button><div id="j3-contenteditable" data-j3-editor="rich" contenteditable="true" role="textbox" aria-label="Rich message ChatGPT" hidden></div>').replace('<!-- J3_PERMISSION -->','<dialog id="permission-dialog" aria-label="Fixture tool permission"><p>Offline reconstruction permission, not a system permission.</p><button id="permission-allow">Allow fixture tool</button><button id="permission-deny">Deny fixture tool</button><output id="permission-result" aria-live="polite"></output></dialog>'));
  if(j3Layout==='app-root')files['/'].body=Buffer.from(files['/'].body.toString().replace('<body>','<body><div id="native-app-root" style="display:flex;width:100%;height:100vh">').replace('<script type="module" src="/native.mjs">','</div><script type="module" src="/native.mjs">'));
  const oracleBytes = await readFile(new URL('../expected/legacy.mjs', import.meta.url));
  const sourceBytes = await readFile(new URL('./server.mjs', import.meta.url));
  // Original dates belong to this local service's fixed historical records, not a backup or UI injection.
  const historySentAt=new Date(now()-45*86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
  let identity = principalId;
  let roster = clone(accounts ?? [{account_id:DEFAULT_ACCOUNT,name:'Personal',plan_type:'free',structure:'personal'}]);
  const cookie = randomBytes(24).toString('hex');
  const token = `fixture-only-${randomBytes(24).toString('hex')}`;
  const counts = Object.create(null), requests = Object.create(null), fixedGetTrace = [];
  let projectCounter = 0, newConversationCounter = 0;
  let detailHold = null;
  const detailAppends = new Map(), detailAcceptances = new Map();
  const projects = new Map([[PROJECT_ONE,{id:PROJECT_ONE,name:'Research'}],[PROJECT_TWO,{id:PROJECT_TWO,name:'Research'}]]);
  if(journey==='J1')for(const project of j1NativeProjects)projects.set(project.id,{...project});
  const conversations = new Map([
    [C_ONE,{id:C_ONE,title:'First project conversation',project:PROJECT_ONE}],
    [C_TWO,{id:C_TWO,title:'Second project conversation',project:PROJECT_TWO}],
    [C_NONE,{id:C_NONE,title:'Ordinary conversation',project:null}],
    [C_UNKNOWN,{id:C_UNKNOWN,title:'Membership not loaded'}],
  ]);
  const j2=journey==='J2'?createJ2SendFixture({principal:()=>identity,accounts:()=>roster,now}):null;
  const firstSend=journey==='FIRST_SEND'?createFirstSendFixture({principal:()=>identity,accounts:()=>roster,conversations,detailAppends,detailAcceptances}):null;
  const projectHref = (id) => `/g/${id}/project`;
  const sessionAuthorized = (req) => (req.headers.cookie ?? '').split(';').some((item) => item.trim() === `host_fixture_session=${cookie}`);
  const json = (res, status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); };
  const notFound = (res) => json(res,404,{error:'not-found'});
  const appRoute = (path) => {
    if(path === '/') return {title:'New chat',text:'How can I help?',conversationId:null};
    const projectMatch = /^\/g\/([^/]+)\/project$/.exec(path);
    if(projectMatch && projects.has(projectMatch[1])) {
      const project = projects.get(projectMatch[1]);
      return {title:project.name,project:clone(project),conversations:[...conversations.values()].filter((c) => c.project === project.id).map((c) => ({id:c.id,title:c.title,href:`/c/${c.id}`}))};
    }
    const conversationMatch = /^\/c\/([^/]+)$/.exec(path);
    const conversation = conversationMatch && conversations.get(conversationMatch[1]);
    if(conversation) return {...(j2&&conversation.id===J2_C?j2.view():{}),...(firstSend?.view(conversation.id)??{}),title:conversation.title,conversationId:conversation.id,text:'This is an offline native application reconstruction.',...(journey==='J3'?{messages:[{messageId:'j3_'+conversation.id.replaceAll('-','')+'_message',branchId:'j3_branch',text:'Offline prefix uniquely selected fixture words suffix.'}]}:{})};
    return null;
  };
  const readBody = async (req) => {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if(size > 4096) throw new Error('body-too-large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const server = http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      requests[url.pathname] = (requests[url.pathname] ?? 0) + 1;
      if(req.method==='GET') {
        const kind=url.pathname==='/api/auth/session'?'auth-shared-purpose':url.pathname==='/backend-api/accounts/check/v4-2023-04-27'?'accounts-shared-purpose':/^\/backend-api\/conversation\//.test(url.pathname)?'conversation-detail':/^\/native\/first-send\//.test(url.pathname)?'operation-mapping':null;
        if(kind&&fixedGetTrace.length<4096)fixedGetTrace.push({kind,at:now()});
      }
      // No catch-all file server: oracle, source, manifests and control methods are unreachable.
      if(req.method === 'GET' && (files[url.pathname] || appRoute(url.pathname))) {
        const file = files[url.pathname] ?? files['/'];
        const headers = {'Content-Type':file.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
        if(file === files['/']) headers['Set-Cookie'] = `host_fixture_session=${cookie}; HttpOnly; SameSite=Lax; Path=/`;
        res.writeHead(200,headers); res.end(file.body); return;
      }
      if(url.pathname === '/api/auth/session' && req.method === 'GET') {
        if(!identity || !sessionAuthorized(req)) return json(res,401,{error:'unauthenticated'});
        return json(res,200,{user:{id:identity},expires:new Date(now()+3600000).toISOString(),accessToken:token});
      }
      if(url.pathname === '/backend-api/accounts/check/v4-2023-04-27' && req.method === 'GET') {
        if(!identity || !sessionAuthorized(req) || req.headers.authorization !== `Bearer ${token}`) return json(res,401,{error:'unauthenticated'});
        return json(res,200,{accounts:Object.fromEntries(roster.map((account) => [account.account_id,{account:clone(account)}])),account_order:roster.map((account) => account.account_id)});
      }
      const detailMatch = /^\/backend-api\/conversation\/([a-f0-9-]+)$/.exec(url.pathname);
      if(detailMatch && req.method === 'GET') {
        if(!identity || !sessionAuthorized(req) || req.headers.authorization !== `Bearer ${token}`) return json(res,401,{error:'unauthenticated'});
        const conversation = conversations.get(detailMatch[1]);
        if(!conversation || url.search) return notFound(res);
        if(j2&&conversation.id===J2_C)return json(res,200,j2.detail());
        const authorId = identity;
        if(detailHold) await detailHold.promise;
        if(res.destroyed) return;
        if(journey==='J3'){const messageId='j3_'+conversation.id.replaceAll('-','')+'_message';return json(res,200,{conversation_id:conversation.id,history_semantics:'fixture-original-self-send/1',mapping:{j3_node:{id:'j3_node',parent:null,message:{id:messageId,author:{role:'user',id:principalId},original_send:{author_id:principalId,conversation_id:conversation.id,kind:'new-send',state:'committed',precision:'second',sent_at:historySentAt},content:{parts:['Offline prefix uniquely selected fixture words suffix.']}}}}});}
        // Deliberate offline metadata reconstruction; never a live API capture or ACK.
        return json(res,200,{conversation_id:conversation.id,mapping:Object.fromEntries(['fixture_m1','fixture_m2','fixture_not_current',...(detailAppends.get(conversation.id)??[])].map((id,i)=>['node_'+i,{id:'node_'+i,parent:i?'node_'+(i-1):null,message:{id,...(detailAcceptances.get(conversation.id)?.has(id)?{status:'fixture-accepted'}:{}),author:{role:i===1?'assistant':'user',id:authorId},create_time:1700000000+i,content:{parts:['SYNTHETIC_BODY_MUST_NOT_ESCAPE']}}}]))});
      }
      if(!sessionAuthorized(req) || !identity) return json(res,401,{error:'unauthenticated'});
      if(j2?.handle(req,res,url,json))return;
      if(firstSend?.handle(req,res,url,json))return;
      if(url.pathname === '/native/route' && req.method === 'GET') {
        const view = appRoute(url.searchParams.get('path')); return view ? json(res,200,view) : notFound(res);
      }
      if(url.pathname === '/backend-api/conversations' && req.method === 'GET') {
        const query = (url.searchParams.get('query') ?? '').toLowerCase();
        return json(res,200,{items:[...conversations.values()].filter((c) => c.title.toLowerCase().includes(query)).map(({id,title}) => ({id,title})),total:conversations.size,offset:0,limit:28});
      }
      if(url.pathname === '/native/move-menu' && req.method === 'GET') {
        const conversation = conversations.get(url.searchParams.get('conversation'));
        if(!conversation) return notFound(res);
        const items = [];
        if(Object.hasOwn(conversation,'project')) items.push({label:'No project',selected:conversation.project === null});
        for(const project of projects.values()) items.push({label:project.name,selected:conversation.project === project.id});
        return json(res,200,{conversationId:conversation.id,items});
      }
      if(url.pathname === '/native/action' && req.method === 'POST') {
        const input = await readBody(req);
        const allowed = ['navigate','new-chat','open-project-button','search','new-project','create-project','new-project-chat','model','tools','account','send-intent',...(journey==='J3'?['permission-allow','permission-deny','editor-mode']:[])];
        if(!input || !allowed.includes(input.kind)) return json(res,400,{error:'invalid-action'});
        counts[input.kind] = (counts[input.kind] ?? 0) + 1;
        if(input.kind === 'open-project-button') return json(res,200,{href:projectHref(PROJECT_TWO)});
        if(input.kind === 'create-project') {
          if(typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) return json(res,400,{error:'invalid-name'});
          const id = `g-p-${String(++projectCounter+100).padStart(32,'0')}`; projects.set(id,{id,name:input.name}); return json(res,200,{href:projectHref(id)});
        }
        if(input.kind === 'new-project-chat') {
          if(!projects.has(input.projectId)) return json(res,400,{error:'invalid-project'});
          const id = `55555555-5555-4555-8555-${String(++newConversationCounter).padStart(12,'0')}`;
          conversations.set(id,{id,title:'New conversation',project:input.projectId}); return json(res,200,{href:`/c/${id}`});
        }
        return json(res,200,{ok:true});
      }
      return notFound(res);
    } catch(error) { if(!res.headersSent) json(res,400,{error:'invalid-request'}); else res.end(); }
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,url:`${origin}/`,
    manifest: Object.freeze({fixtureId:'chatgpt-host-legacy-reconstruction-v1',profile,j3Layout,...(journey?{journey,journeyEvidence:journey==='J3'?'S_RECONSTRUCTION_NOT_REAL_PERMISSION':'S_RECONSTRUCTION_NATIVE_PENDING_CONTROLS'}:{}),reconstruction:true,source:'VA-HOST/1.1 structure reconstruction; not a real DOM snapshot',sourceCommit:null,sourceBlob:null,fixtureHash:createHash('sha256').update(sourceBytes).update(Buffer.concat(Object.values(files).map((f) => f.body))).digest('hex'),expectedWorldFile:'tests/host/expected/legacy.mjs',oracleHash:createHash('sha256').update(oracleBytes).digest('hex'),supportedCapabilities:['principal','personal-context-candidate','project-identity','idless-native-control','conversation-identity','native-move-menu','native-navigation','native-search','native-create','independent-regions','draft-preservation']}),
    snapshot: () => clone({actions:counts,requests,fixedGetTrace,...(j2?{j2:j2.snapshot()}:{}),...(firstSend?{firstSends:firstSend.snapshot()}:{}),projectCount:projects.size,conversationCount:conversations.size}),
    // Test-process controls only; not HTTP endpoints, not page-visible authority.
    setPrincipal: (id,{accounts: nextAccounts = roster} = {}) => { identity = id; roster = clone(nextAccounts); },
    acceptConversationMetadata: (conversationId,messageId) => { if(!(detailAppends.get(conversationId)??[]).includes(messageId))throw Error('missing-fixture-metadata');const ids=detailAcceptances.get(conversationId)??new Set();ids.add(messageId);detailAcceptances.set(conversationId,ids); },
    appendConversationMetadata: (conversationId,messageId) => { if(!conversations.has(conversationId)||typeof messageId!=='string'||!/^fixture_[a-z0-9_]+$/.test(messageId))throw Error('invalid-fixture-metadata');const ids=detailAppends.get(conversationId)??[];if(ids.includes(messageId))throw Error('duplicate-fixture-metadata');detailAppends.set(conversationId,[...ids,messageId]); },
    holdConversationDetails: () => { if(detailHold) throw Error('detail-already-held'); let release; const promise = new Promise(r=>release=r); detailHold={promise,release}; },
    releaseConversationDetails: () => { const pending=detailHold; detailHold=null; pending?.release(); },
    close: () => new Promise((resolve,reject) => {server.close((error) => error ? reject(error) : resolve());server.closeAllConnections();}),
  };
}
