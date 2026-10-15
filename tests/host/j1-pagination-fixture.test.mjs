import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {j1CandidatePage} from './fixtures/j1-candidate-page.mjs';
import {j1PaginationExpected as expected} from './expected/j1-pagination.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
const html=await readFile(new URL('./fixtures/legacy.html',import.meta.url),'utf8');
test('J1 fixture exposes independent nonzero page target without fake project IDs',()=>{
 const result=j1CandidatePage(html),before=result.split('<button class="project-entry">Research</button>')[0];
 assert.equal((result.match(/data-j1-pending=/g)??[]).length,expected.pendingControls);
 assert.equal((before.match(/data-j1-pending=/g)??[]).length,expected.targetInitialOrdinal);
 assert.equal(Math.floor(expected.targetInitialOrdinal/expected.pageSize)*expected.pageSize,expected.targetPageOffset);
 assert.equal((result.match(/class="project-entry"/g)??[]).length,1);
 assert.equal((result.match(/\/g\/g-p-/g)??[]).length,1);
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
