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
 * Only LEGACY is currently implemented; unsupported profiles fail explicitly.
 */
export async function createHostFixtureServer({profile = 'LEGACY', principalId = 'user-host-fixture', accounts = null, now = () => Date.now()} = {}) {
  if (profile !== 'LEGACY') throw new Error('fixture-profile-not-implemented');
  const files = Object.fromEntries(await Promise.all([
    ['/', 'legacy.html', 'text/html; charset=utf-8'],
    ['/native.mjs', 'native.mjs', 'text/javascript; charset=utf-8'],
    ['/native.css', 'native.css', 'text/css; charset=utf-8'],
  ].map(async ([url, file, mime]) => [url, {body: await readFile(new URL(file, import.meta.url)), mime}])));
  const oracleBytes = await readFile(new URL('../expected/legacy.mjs', import.meta.url));
  const sourceBytes = await readFile(new URL('./server.mjs', import.meta.url));
  let identity = principalId;
  let roster = clone(accounts ?? [{account_id:DEFAULT_ACCOUNT,name:'Personal',plan_type:'free',structure:'personal'}]);
  const cookie = randomBytes(24).toString('hex');
  const token = `fixture-only-${randomBytes(24).toString('hex')}`;
  const counts = Object.create(null), requests = Object.create(null);
  let projectCounter = 0, newConversationCounter = 0;
  const projects = new Map([[PROJECT_ONE,{id:PROJECT_ONE,name:'Research'}],[PROJECT_TWO,{id:PROJECT_TWO,name:'Research'}]]);
  const conversations = new Map([
    [C_ONE,{id:C_ONE,title:'First project conversation',project:PROJECT_ONE}],
    [C_TWO,{id:C_TWO,title:'Second project conversation',project:PROJECT_TWO}],
    [C_NONE,{id:C_NONE,title:'Ordinary conversation',project:null}],
    [C_UNKNOWN,{id:C_UNKNOWN,title:'Membership not loaded'}],
  ]);
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
    if(conversation) return {title:conversation.title,conversationId:conversation.id,text:'This is an offline native application reconstruction.'};
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
      if(!sessionAuthorized(req) || !identity) return json(res,401,{error:'unauthenticated'});
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
        const allowed = ['navigate','new-chat','open-project-button','search','new-project','create-project','new-project-chat','model','tools','account','send-intent'];
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
    manifest: Object.freeze({fixtureId:'chatgpt-host-legacy-reconstruction-v1',profile,reconstruction:true,source:'VA-HOST/1.1 structure reconstruction; not a real DOM snapshot',sourceCommit:null,sourceBlob:null,fixtureHash:createHash('sha256').update(sourceBytes).update(Buffer.concat(Object.values(files).map((f) => f.body))).digest('hex'),expectedWorldFile:'tests/host/expected/legacy.mjs',oracleHash:createHash('sha256').update(oracleBytes).digest('hex'),supportedCapabilities:['principal','personal-context-candidate','project-identity','idless-native-control','conversation-identity','native-move-menu','native-navigation','native-search','native-create','independent-regions','draft-preservation']}),
    snapshot: () => clone({actions:counts,requests,projectCount:projects.size,conversationCount:conversations.size}),
    // Test-process controls only; not HTTP endpoints, not page-visible authority.
    setPrincipal: (id,{accounts: nextAccounts = roster} = {}) => { identity = id; roster = clone(nextAccounts); },
    close: () => new Promise((resolve,reject) => {server.close((error) => error ? reject(error) : resolve());server.closeAllConnections();}),
  };
}
