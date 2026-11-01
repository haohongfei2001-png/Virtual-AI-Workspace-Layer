import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHostFixtureServer} from './fixtures/server.mjs';

const opening='<div id="native-app-root" style="display:flex;width:100%;height:100vh">';
async function withServer(options,run){const server=await createHostFixtureServer(options);try{await run(server,await (await fetch(server.url)).text());}finally{await server.close();}}

test('default and explicit direct preserve original native HTML byte for byte',async()=>{
 const original=await readFile(new URL('./fixtures/legacy.html',import.meta.url),'utf8');
 for(const options of [{},{j3Layout:'direct'}])await withServer(options,async(server,html)=>{assert.equal(html,original);assert.equal(server.manifest.j3Layout,'direct');assert(!html.includes('native-app-root'));assert(!html.includes('id="permission-dialog"'));});
});

test('J3 wrapper is server-rendered, unique, lossless and excludes the unchanged native script',async()=>{
 await withServer({journey:'J3'},async(direct,plain)=>{
  await withServer({journey:'J3',j3Layout:'app-root'},async(wrapped,html)=>{
   assert.equal(html.split(opening).length-1,1);
   assert.equal(html.replace(opening,'').replace('</div><script type="module" src="/native.mjs">','<script type="module" src="/native.mjs">'),plain);
   assert.match(html,/<body><div id="native-app-root"/);
   const inside=html.slice(html.indexOf(opening)+opening.length,html.indexOf('</div><script'));
   for(const token of ['<aside ','<main>','id="composer"','id="prompt-textarea"','id="j3-contenteditable"','id="search-dialog"','id="project-dialog"','id="move-dialog"','id="native-dialog"','id="permission-dialog"','type="file"'])assert(inside.includes(token),token);
   assert(!inside.includes('<script'));assert.equal((html.match(/src="\/native.mjs"/g)??[]).length,1);
   assert.equal(wrapped.manifest.j3Layout,'app-root');assert.equal(wrapped.manifest.journeyEvidence,'S_RECONSTRUCTION_NOT_REAL_PERMISSION');
   assert.notEqual(wrapped.manifest.fixtureHash,direct.manifest.fixtureHash);
   for(const path of ['/native.mjs','/native.css'])assert.equal(await(await fetch(wrapped.origin+path)).text(),await(await fetch(direct.origin+path)).text());
  });
 });
});

test('both layouts preserve unauthenticated refusal and perform no native action merely by loading',async()=>{
 for(const j3Layout of ['direct','app-root'])await withServer({journey:'J3',j3Layout},async(server)=>{
  for(const path of ['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27'])assert.equal((await fetch(server.origin+path)).status,401);
  const response=await fetch(server.origin+'/native/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'permission-allow'})});assert.equal(response.status,401);
  assert.deepEqual(server.snapshot().actions,{});
 });
});

test('invalid layouts and non-J3/non-LEGACY wrappers fail before creating a server',async()=>{
 for(const options of [{j3Layout:null},{j3Layout:''},{j3Layout:'other'},{j3Layout:1},{j3Layout:'app-root'},{journey:'J1',j3Layout:'app-root'},{journey:'J2',j3Layout:'app-root'},{profile:'MODERN',journey:'J3',j3Layout:'app-root'}])await assert.rejects(createHostFixtureServer(options),/invalid-fixture-j3-layout/);
});
