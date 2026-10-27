import test from 'node:test';
import assert from 'node:assert/strict';
import {ui10Cases,UI10_PROFILES,UI10_LONG_CHINESE,UI10_REQUIRED_VIEWS,configureUi10Environment,assertUi10ShellBounds,observeUi10Shell,ui10PreparationReport} from './ui10-matrix-contract.mjs';

const geometry=()=>({m:{width:420,height:520,document:{scrollWidth:420,scrollHeight:520},scrollX:0,scrollY:0,main:{y:30,height:490}},outer:{frame:{top:30,bottom:520},close:{bottom:30},surface:{bottom:520}}});
test('positive profile matrix covers exact independent size/theme/title/height dimensions',()=>{
 const cases=ui10Cases();assert.equal(cases.length,48);assert.equal(new Set(cases.map(c=>c.id)).size,48);
 for(const profile of UI10_PROFILES){const rows=cases.filter(c=>c.profile===profile);assert.equal(rows.length,16);for(const key of ['colorScheme','title'])assert.equal(new Set(rows.map(c=>c[key])).size,2);assert.deepEqual([...new Set(rows.map(c=>c.viewport.width))],[1440,420]);assert.deepEqual([...new Set(rows.map(c=>c.viewport.height))],[1000,520]);}
 assert(cases.every(c=>c.zoom===1&&c.nativeEvidence==='NOT_RUN'&&c.browser==='chrome-mv3-runner'));
 assert(cases.filter(c=>c.title==='long-Chinese').every(c=>c.fixtureTitle===UI10_LONG_CHINESE));
 assert.equal(UI10_LONG_CHINESE,'长期研究项目与知识管理中文标题'.repeat(12));
});
test('configuration uses browser viewport and media only, with no native DOM changes or CSS zoom',async()=>{
 const calls=[],page={setViewportSize:async v=>calls.push(['viewport',v]),emulateMedia:async v=>calls.push(['media',v])};
 for(const cell of ui10Cases()){calls.length=0;const result=await configureUi10Environment(page,cell);assert.deepEqual(calls,[['viewport',cell.viewport],['media',{colorScheme:cell.colorScheme}]]);assert.equal(result.physicalKeyboard,'NOT_RUN');assert.equal(result.physicalIME,'NOT_RUN');assert.equal(result.nativeEvidence,'NOT_RUN');}
});
test('unknown profiles, zoom substitutes and modified cells are rejected before browser calls',async()=>{
 for(const change of [{profile:'FAULT'},{browser:'firefox'},{zoom:2},{nativeEvidence:'PASS'},{viewport:{width:320,height:520}}]){
  await assert.rejects(configureUi10Environment({}, {...ui10Cases()[0],...change}),/unknown-ui10-cell/);
 }
});
test('inherited shell geometry retains original 1px tolerance',()=>{
 const {m,outer}=geometry();assertUi10ShellBounds(m,outer);m.document.scrollWidth=421;m.document.scrollHeight=521;m.main.y=-1;m.main.height=522;outer.frame.top=29;outer.frame.bottom=521;assertUi10ShellBounds(m,outer);
});
for(const [name,mutate] of [
 ['width overflow',x=>x.m.document.scrollWidth=422],['height overflow',x=>x.m.document.scrollHeight=522],
 ['horizontal scroll',x=>x.m.scrollX=1],['vertical scroll',x=>x.m.scrollY=1],
 ['empty main',x=>x.m.main.height=0],['main above bounds',x=>x.m.main.y=-2],
 ['main below bounds',x=>x.m.main.height=492],['frame covers close',x=>x.outer.frame.top=28],
 ['frame below surface',x=>x.outer.frame.bottom=522],['zero viewport',x=>x.m.width=0],
])test(`shell oracle rejects ${name}`,()=>{const x=geometry();mutate(x);assert.throws(()=>assertUi10ShellBounds(x.m,x.outer));});
test('read-only sampler checks geometry without claiming full UI acceptance',async()=>{
 const {m,outer}=geometry();let reads=0;const result=await observeUi10Shell({evaluate:async()=>{reads++;return m;},frameElement:async()=>({evaluate:async()=>{reads++;return outer;}})});
 assert.equal(reads,2);assert.equal(result.evidence,'SHELL_GEOMETRY_ONLY');assert.equal(result.fullV27Acceptance,'NOT_ESTABLISHED');
});
test('document-flow exit may share the frame plane but cannot cover a renderer control',()=>{
 const {m,outer}=geometry();Object.assign(outer,{backend:'document-flow',closeHit:true,closeCoversControl:false});
 Object.assign(outer.surface,{top:0,left:0,right:420});Object.assign(outer.close,{top:4,bottom:28,left:392,right:416});outer.frame.top=0;
 assertUi10ShellBounds(m,outer);
 for(const change of [{closeHit:false},{closeCoversControl:true},{close:{...outer.close,right:423}}])assert.throws(()=>assertUi10ShellBounds(m,{...outer,...change}));
});
test('preparation never promotes past J3 zoom or deterministic results into new native evidence',()=>{
 const r=ui10PreparationReport();assert.equal(r.nativeMatrix,'NOT_RUN');assert.equal(r.fullV27Acceptance,'NOT_ESTABLISHED');assert.equal(r.baseline.generateFromCandidate,false);assert.equal(r.inheritedZoom.appliesToNewCells,false);assert.equal(r.cells.length,48);assert(r.cells.every(c=>c.nativeEvidence==='NOT_RUN'));assert.deepEqual(r.requiredViews,UI10_REQUIRED_VIEWS);assert.deepEqual(r.excludedAsPositive,['FAULT']);
 r.cells[0].nativeEvidence='PASS';r.requiredViews.pop();assert.equal(ui10PreparationReport().cells[0].nativeEvidence,'NOT_RUN');assert.equal(ui10PreparationReport().requiredViews.length,11);
});

test('height transition observes before, reduced and restored without recreating a page',async()=>{
 const {exerciseUi10HeightChange}=await import('./ui10-matrix-contract.mjs');const calls=[];
 const page={setViewportSize:async v=>calls.push(v.height),emulateMedia:async()=>{}};
 const result=await exerciseUi10HeightChange(page,ui10Cases()[0],async({phase})=>({phase,contractOnly:true}));
 assert.deepEqual(calls,[1000,520,1000]);assert.deepEqual(result.observations.map(o=>o.phase),['before','reduced','restored']);assert.equal(result.physicalKeyboard,'NOT_RUN');
});
test('failed height continuity observation aborts without recovery reload or later success',async()=>{
 const {exerciseUi10HeightChange}=await import('./ui10-matrix-contract.mjs');const calls=[];
 await assert.rejects(exerciseUi10HeightChange({setViewportSize:async v=>calls.push(v.height),emulateMedia:async()=>{}},ui10Cases()[0],async({phase})=>{if(phase==='reduced')throw Error('original-editor-replaced');}),/original-editor-replaced/);
 assert.deepEqual(calls,[1000,520]);
});
