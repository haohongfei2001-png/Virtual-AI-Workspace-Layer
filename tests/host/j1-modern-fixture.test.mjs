import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {j1PaginationExpected as expected} from './expected/j1-pagination.mjs';
import {modernExpectedWorld as world} from './expected/modern.mjs';
test('MODERN J1 keeps independent pagination surface and explicit native Project context requests',async()=>{
 const ordinary=await createVariantHostFixtureServer({profile:'MODERN'}),server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J1'});
 try{
  const normal=await (await fetch(ordinary.url)).text(),response=await fetch(server.url),html=await response.text(),cookie=response.headers.get('set-cookie').split(';')[0];
  assert(!normal.includes('data-j1-pending'));assert.equal((html.match(/data-j1-pending=/g)??[]).length,expected.pendingControls);
  assert.equal(server.snapshot().projectCount,expected.canonicalProjects);assert.equal(server.manifest.journey,'J1');assert.notEqual(server.manifest.fixtureHash,ordinary.manifest.fixtureHash);
  for(const p of expected.additionalProjects){const result=await fetch(server.origin+'/backend-api/projects/'+p.id,{headers:{Cookie:cookie,'Chatgpt-Account-Id':world.selectedContext}});assert.equal(result.status,200);assert.deepEqual((await result.json()).project,p);}
  assert.equal(server.snapshot().actions.navigate,undefined);assert.equal(server.snapshot().nativeRequests.length,38);
  const denied=await fetch(server.origin+'/backend-api/projects/'+expected.additionalProjects[0].id,{headers:{Cookie:cookie,'Chatgpt-Account-Id':'not-in-roster'}});assert.equal(denied.status,403);
 }finally{await ordinary.close();await server.close();}
});
for(const profile of ['PARTIAL','FAULT'])test('J1 cannot silently use '+profile,async()=>{await assert.rejects(createVariantHostFixtureServer({profile,journey:'J1'}),/unsupported-variant-journey/);});
