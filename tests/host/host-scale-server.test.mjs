import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {hostScaleExpected,scaleConversationId} from './fixtures/host-scale-world.mjs';
import {hostScalePlan} from './fixtures/host-scale-plan.mjs';
for(const distribution of ['project-mixed','none-heavy','single-project'])test('native scale service owns 1k world and authenticates '+distribution,async()=>{
 const server=await createHostScaleServer({size:1000,distribution});
 try{
  const response=await fetch(server.url),html=await response.text(),cookie=response.headers.get('set-cookie').split(';')[0],headers={cookie},oracle=hostScaleExpected({size:1000,distribution});
  assert.equal((html.match(/href="\/c\//g)??[]).length,1000);assert(html.includes('/c/'+oracle.last));assert(!html.includes('actorVerified'));assert(!html.includes('uiGrant'));
  assert.equal((await fetch(server.origin+'/api/auth/session')).status,401);
  const session=await (await fetch(server.origin+'/api/auth/session',{headers})).json();assert.equal(session.user.id,'user-host-scale');
  const accountURL=server.origin+'/backend-api/accounts/check/v4-2023-04-27';assert.equal((await fetch(accountURL,{headers})).status,401);
  const accounts=await (await fetch(accountURL,{headers:{...headers,authorization:'Bearer '+session.accessToken}})).json();assert.deepEqual(accounts.account_order,['account-host-scale']);
  const search=await (await fetch(server.origin+'/backend-api/conversations?query=000999',{headers})).json();assert.equal(search.total,1);assert.equal(search.items[0].id,oracle.last);assert(!('project'in search.items[0]));
  const all=await (await fetch(server.origin+'/backend-api/conversations',{headers})).json();assert.equal(all.total,1000);assert.equal(all.items.length,28);
  const view=await (await fetch(server.origin+'/native/route?path='+encodeURIComponent('/c/'+oracle.last),{headers})).json();assert.equal(view.conversationId,oracle.last);assert(!('project'in view));
  const move=await (await fetch(server.origin+'/native/move-menu?conversation='+oracle.last,{headers})).json();assert.equal(move.items.filter(x=>x.selected).length,1);assert.equal(move.items[0].selected,distribution!=='single-project');
  const project=await (await fetch(server.origin+'/native/route?path='+encodeURIComponent('/g/g-p-00000000000000000000000000000001/project'),{headers})).json();assert.equal(project.conversations.length,distribution==='single-project'?1000:distribution==='project-mixed'?80:10);assert.equal(project.conversations[0].id,scaleConversationId(0));
  for(const path of ['/fixtures/host-scale-world.mjs','/expected/legacy.mjs','/build-manifest.json','/native/seed'])assert.equal((await fetch(server.origin+path,{headers})).status,404);
  assert.equal((await fetch(server.origin+'/native/action',{method:'POST',headers,body:JSON.stringify({kind:'create-project',name:'forbidden'})})).status,400);
  assert.equal(server.snapshot().nativeConversations,1000);assert.equal(server.snapshot().nativeProjects,oracle.projects);assert.deepEqual(server.snapshot().actions,{});
 }finally{await server.close();}
});
test('matrix retains every scale, distribution and CPU boundary without claiming acceptance',()=>{
 const plan=hostScalePlan();assert.equal(plan.scenarios.length,18);assert.equal(new Set(plan.scenarios.map(s=>[s.size,s.distribution,s.cpuRate].join('/'))).size,18);assert.equal(plan.status,'NOT_RUN');assert(plan.scenarios.every(s=>s.rpcBudgetMs===6000));assert(plan.remaining.some(x=>x.includes('p95 <150ms')));assert(plan.remaining.some(x=>x.includes('<300ms')));
});
test('default runner writes NOT_RUN without importing browser or allocating native scale',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'host-scale-plan-test-')),output=join(dir,'plan.json');const env={...process.env};delete env.HOST_SCALE_RUN;
 execFileSync(process.execPath,[new URL('./host-scale-package-browser.mjs',import.meta.url).pathname,output],{env});const report=JSON.parse(await readFile(output));assert.equal(report.status,'NOT_RUN');assert.equal(report.scenarios.length,18);
});
test('runner is guarded, preserves transport, and does not seed authority or replace production deadline',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert(!source.includes('historicalNetworkGuard'));assert(source.includes("PACKAGED_EXACT_ORIGIN_CONNECT_SRC"));assert(source.includes('cleanupHostScaleRun')); assert(source.includes("Emulation.setCPUThrottlingRate"));assert(source.includes('const started=performance.now(),result=send(...args)'));assert(!source.includes('native_states'));assert(!source.includes('.seed('));assert(source.includes("PARTIAL_SYS04_NOT_ACCEPTED"));
});
