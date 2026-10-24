import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ui10PackageOptions,ui10Entry,ui10Sequence} from './ui10-package-sequence.mjs';
import {UI10_PROFILES,UI10_LONG_CHINESE} from './ui10-matrix-contract.mjs';
const runner=readFileSync(new URL('./ui10-package-matrix-browser.mjs',import.meta.url),'utf8');
test('each profile uses the matching existing fixture and package context proof',()=>{
 for(const profile of UI10_PROFILES)assert.deepEqual(ui10PackageOptions(profile,'http://127.0.0.1:12345'),{offlineOrigin:'http://127.0.0.1:12345',...(profile==='MODERN'?{offlineContext:true}:{})});
 assert.match(ui10Entry('PARTIAL'),/77777777-7777-4777-8777-000000000001$/);assert.match(ui10Entry('MODERN'),/33333333-3333-4333-8333-333333333333$/);
 for(const profile of ['FAULT','NEW',''])assert.throws(()=>ui10PackageOptions(profile,'http://127.0.0.1:12345'));
 for(const origin of ['https://chatgpt.com','http://localhost:1234','http://127.0.0.1:1234/path','https://127.0.0.1'])assert.throws(()=>ui10PackageOptions('LEGACY',origin));
});
test('sequence has 16 distinct cells and 8 same-page before/reduced/restored triples per profile',()=>{
 for(const profile of UI10_PROFILES){const sequence=ui10Sequence(profile);assert.equal(sequence.length,24);assert.equal(new Set(sequence.map(s=>s.cell.id)).size,16);assert(sequence.slice(0,12).every(s=>s.cell.title==='ordinary'));assert(sequence.slice(12).every(s=>s.cell.title==='long-Chinese'));
 for(let i=0;i<24;i+=3){const triple=sequence.slice(i,i+3);assert.deepEqual(triple.map(s=>s.phase),['before','reduced','restored']);assert.deepEqual(triple.map(s=>s.cell.viewport.height),[1000,520,1000]);assert.equal(triple[0].cell.id,triple[2].cell.id);}
 }
});
test('long title fits existing native create-project validation without loosening it',()=>{assert(UI10_LONG_CHINESE.length<=200);assert(UI10_LONG_CHINESE.length>100);assert(runner.includes("getByRole('button',{name:'Create',exact:true}).click()"));assert(runner.includes("actions['create-project'],1"));assert(runner.includes("waitForVisibleUi10Title(frames.workspace,UI10_LONG_CHINESE)"));assert(!runner.includes('innerHTML'));assert(!runner.includes('textContent ='));});
test('runner packages actual source with isolated fixture profiles, source hashes and worker isolation',()=>{
 for(const text of ['createHostFixtureServer({profile})','createVariantHostFixtureServer({profile,ui10ConversationTitle:','ui10PackageOptions(profile,server.origin)','Extensions.loadUnpacked','launchPersistentContext',"fetch('https://example.com/')",'sourceChangedDuringRun','buildManifestUnchanged','testSourcesStable','observeUi10Shell(frames[role])'])assert(runner.includes(text),text);
 assert(!runner.includes('style.zoom'));assert(!runner.includes('setZoom'));assert(!runner.includes('newContext('));
});
test('runner keeps original nodes and File identities and never retries native creation',()=>{
 for(const text of ['ui10Original.document===document','ui10Original.editor===document.querySelector',"ui10Original.input===document.querySelector",'ui10Original.file===ui10Original.input.files[0]',"actions['send-intent']??0,0",'longTitleCreated=true','if(allowReturn&&await back.isVisible())'])assert(runner.includes(text),text);
 assert.equal((runner.match(/name:'Create',exact:true/g)||[]).length,1);assert.equal((runner.match(/page.goto\(/g)||[]).length,1);assert(!runner.includes('page.reload'));
});
test('native candidate cannot claim full v2.7 or physical input acceptance',()=>{assert(runner.includes("fullV27Acceptance:'NOT_ESTABLISHED'"));assert(runner.includes("physicalKeyboard:'NOT_RUN'"));assert(runner.includes("physicalIME:'NOT_RUN'"));assert(runner.includes("'PASS_LAYOUT_SUBCONTRACT_ONLY'"));assert(runner.includes("'FAIL_LAYOUT_SUBCONTRACT_NOT_UI10_ACCEPTANCE'"));});

test('MODERN and PARTIAL long-title cases start on original C with opt-in native data, not project navigation',()=>{assert(runner.includes("profile!=='LEGACY'&&titleMode==='long-Chinese'"));assert(runner.includes("else for(const title of ['ordinary','long-Chinese'])await runProfile(profile,title)"));assert(runner.includes("ui10ConversationTitle:titleMode==='long-Chinese'?UI10_LONG_CHINESE:null"));assert(runner.includes("profile==='LEGACY'?1:0"));});
test('theme is observed within each actual frame and final hash failure is recorded',()=>{assert(runner.includes("frames[role].locator(role==='workspace'?'.workspace':'.toolbar').evaluate"));assert(runner.includes('getComputedStyle(root)'));assert(runner.includes('measurements[role].theme.mediaMatches,true'));assert(runner.includes('report.testHashError=error.stack'));assert(runner.includes('report.testSourcesStable=false'));});

test('long-title diagnostics and helper hash survive failure without relaxing shell checks',()=>{assert(runner.includes('result.titleDiagnostics=error.ui10TitleDiagnostics'));assertRunnerTestBinding(runner);assert(runner.includes('observeUi10Shell(frames[role])'));assert(runner.includes('titleObservation,screenshot'));});

// Inspect the real literal dependency list without executing the browser runner.
// Membership is semantic: adding/reordering dependencies must not break binding.
function assertRunnerTestBinding(source){
 const declarations=[...source.matchAll(/const\s+testFiles\s*=\s*\[([^\]]*)\]\s*;/g)];assert.equal(declarations.length,1,'one literal testFiles declaration');
 const body=declarations[0][1];assert.match(body,/^\s*'[a-zA-Z0-9_./-]+'(?:\s*,\s*'[a-zA-Z0-9_./-]+')*\s*,?\s*$/,'literal relative file names only');
 const files=[...body.matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.equal(new Set(files).size,files.length,'no duplicated binding entries');
 for(const dependency of ['ui10-capture-preparation.mjs','ui10-visual-png-log.mjs','ui10-horizon-commit.mjs','ui10-visible-title.mjs','ui10-interaction-matrix.mjs','ui10-dom-contract.mjs','ui10-interaction-readiness.mjs','ui10-package-matrix-browser.mjs','ui10-package-sequence.mjs','ui10-matrix-contract.mjs','fixtures/variants-server.mjs','fixtures/ui10-conversation-title.mjs'])assert(files.includes(dependency),'unbound dependency: '+dependency);
 const compact=source.replace(/\s+/g,'');
 for(const binding of ["testFiles.map(asyncname=>[name,hash(awaitreadFile(newURL(name,import.meta.url)))])",'testHashesBefore:awaittestHashes()','report.testHashesAfter=awaittestHashes()','report.testSourcesStable=JSON.stringify(report.testHashesBefore)===JSON.stringify(report.testHashesAfter)',"&&report.testSourcesStable?'PASS_LAYOUT_SUBCONTRACT_ONLY':'FAIL'","if(report.status==='FAIL')process.exitCode=1"]){assert(compact.includes(binding),'missing hash binding: '+binding);}
 return files;
}
test('actual runner dependency binding is complete and independent of list order',()=>{const files=assertRunnerTestBinding(runner);const reversed=runner.replace(/const\s+testFiles\s*=\s*\[[^\]]*\]\s*;/,`const testFiles = [ ${files.slice().reverse().map(n=>"'"+n+"'").join(', ')} ];`);assert.deepEqual(assertRunnerTestBinding(reversed),files.slice().reverse());});
test('dependency and before/after hash-binding mutations fail closed',()=>{
 const mutations=[s=>s.replace("'ui10-horizon-commit.mjs',",''),s=>s.replace("'ui10-visible-title.mjs',",''),s=>s.replace("'ui10-visible-title.mjs',","'ui10-visible-title.mjs','ui10-visible-title.mjs',"),s=>s.replace('testFiles.map(async name','[].map(async name'),s=>s.replace('testHashesBefore:await testHashes()','testHashesBefore:{}'),s=>s.replace('report.testHashesAfter=await testHashes()','report.testHashesAfter=report.testHashesBefore'),s=>s.replace('JSON.stringify(report.testHashesBefore)===JSON.stringify(report.testHashesAfter)','true'),s=>s.replace("&&report.testSourcesStable?'PASS_LAYOUT_SUBCONTRACT_ONLY'","?'PASS_LAYOUT_SUBCONTRACT_ONLY'"),s=>s.replace("if(report.status==='FAIL')process.exitCode=1","if(false)process.exitCode=1")];
 for(const mutate of mutations){const changed=mutate(runner);assert.notEqual(changed,runner,'mutation must hit current source');assert.throws(()=>assertRunnerTestBinding(changed));}
});
