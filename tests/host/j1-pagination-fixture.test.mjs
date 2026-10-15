import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {j1CandidatePage} from './fixtures/j1-candidate-page.mjs';
import {j1PaginationExpected as expected,j1CanonicalOrder} from './expected/j1-pagination.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
const html=await readFile(new URL('./fixtures/legacy.html',import.meta.url),'utf8');
test('J1 fixture exposes independent nonzero page target without fake project IDs',()=>{
 const result=j1CandidatePage(html),before=result.split('<button class="project-entry">Research</button>')[0];
 assert.equal((result.match(/data-j1-pending=/g)??[]).length,expected.pendingControls);
 assert.equal((before.match(/data-j1-pending=/g)??[]).length,expected.targetInitialOrdinal);
 assert.equal(Math.floor(expected.targetInitialOrdinal/expected.pageSize)*expected.pageSize,expected.targetPageOffset);
 assert.equal((result.match(/class="project-entry"/g)??[]).length,1);
 assert.equal((result.match(/\/g\/g-p-/g)??[]).length,expected.initialCanonicalProjects);
 assert(!result.includes('__expected'));assert(!result.includes('verified'));
});
test('fixture rejects missing or duplicate native target',()=>{
 assert.throws(()=>j1CandidatePage(''),/not-unique/);
 assert.throws(()=>j1CandidatePage(html+html),/not-unique/);
});
test('J1 is opt-in and served by native fixture, preserving default LEGACY',async()=>{
 const normal=await createHostFixtureServer(),j1=await createHostFixtureServer({journey:'J1'});
 try{
  const defaultHTML=await (await fetch(normal.url)).text(),journeyHTML=await (await fetch(j1.url)).text();
  assert(!defaultHTML.includes('data-j1-pending'));assert.equal((journeyHTML.match(/data-j1-pending=/g)??[]).length,expected.pendingControls);
  assert.equal(j1.manifest.journey,'J1');assert.notEqual(normal.manifest.fixtureHash,j1.manifest.fixtureHash);
  assert.deepEqual(j1.snapshot().actions,{});assert.equal(j1.snapshot().projectCount,expected.canonicalProjects);
 }finally{await normal.close();await j1.close();}
});

test('every extra canonical Project is a real fixture route with independent identity oracle',async()=>{
 const server=await createHostFixtureServer({journey:'J1'});try{
  const response=await fetch(server.url),cookie=response.headers.get('set-cookie').split(';')[0];
  for(const p of expected.additionalProjects){const r=await fetch(server.origin+'/native/route?path='+encodeURIComponent('/g/'+p.id+'/project'),{headers:{Cookie:cookie}});assert.equal(r.status,200);const view=await r.json();assert.deepEqual(view.project,p);assert.deepEqual(view.conversations,[]);}
  assert.equal(new Set(expected.additionalProjects.map(p=>p.id)).size,38);assert.equal(server.snapshot().actions.navigate,undefined);
 }finally{await server.close();}
});

test('canonical nonzero page has deterministic native insertion order and target is eighth card',()=>{
 const result=j1CandidatePage(html),ids=[...result.matchAll(/href="\/g\/(g-p-[a-f0-9]{32})\/project"/g)].map(m=>m[1]);
 assert.deepEqual(ids,j1CanonicalOrder.slice(0,-1));
 assert.deepEqual([...j1CanonicalOrder].sort(),j1CanonicalOrder);
 const page=j1CanonicalOrder.slice(expected.canonicalPageOffset);
 assert.equal(page.length,expected.canonicalPageSize);assert.equal(page.indexOf('g-p-22222222222222222222222222222222'),7);
 assert.equal(expected.canonicalPageOffset,32);assert.equal(j1CanonicalOrder.length,40);
});
