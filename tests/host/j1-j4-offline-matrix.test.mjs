import {partialCheckpoints} from './partial-paging-oracle.mjs';
import {samplePartialPaging} from './partial-paging-sample.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {journeyMatrixCases,j2RequiredCheckpoints,j3RequiredCheckpoints,j4RequiredCheckpoints,j4OptionalPeerRecovery,matrixEnvironment,admitMatrixReport,summarizeJourneyMatrix,runJourneyMatrix} from './j1-j4-offline-matrix.mjs';
const sourceHashes={'src/example.mjs':'abc'};
function sample(c){const n={J1:9,J2:8,J3:16,PARTIAL:3,J4:3}[c.journey],steps=Array.from({length:n},()=>({status:'PASS'}));const r={status:['J1','J4'].includes(c.journey)?`PARTIAL_${c.journey}_NOT_ACCEPTED`:c.journey==='J2'?'PASS_OFFLINE_J2_JOURNEY':'PASS',profile:c.profile,realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',releaseStatus:'NOT_RELEASE_READY',physicalIME:'NOT_RUN',errors:[],sourceChangedDuringRun:false,fixtureChangedDuringRun:false,scriptChangedDuringRun:false,ui06HelperChangedDuringRun:false,buildManifestUnchanged:true,sourceHashes,steps,results:steps,workerExternalNetwork:'BLOCKED',evidence:c.journey==='J4'?'S_CONTINUOUS_REAL_PACKAGED_MV3_J4_SEGMENT':c.journey==='J2'?'OFFLINE_PACKAGED_MV3_REAL_WALL_CLOCK':c.journey==='PARTIAL'?'REAL_HEADLESS_PACKAGED_MV3_PARTIAL_RECONSTRUCTION':'SINGLE_CONTINUOUS_REAL_HEADLESS_PACKAGED_MV3_OFFLINE_JOURNEY',jointInterruptionBoundary:c.boundary,codecScenario:c.codec};if(c.journey==='J4'){let cycle=0;r.steps=j4RequiredCheckpoints(c).map(name=>({status:'PASS',name,...(name==='repeated-actual-disable-reenable-preserves-two-unrefreshed-native-documents'?{cycle:++cycle}:{})}));if(c.repeat)r.repeatedReenable=[{cycle:1},{cycle:2}];}if(c.journey==='J2')r.steps=j2RequiredCheckpoints.map((name,index)=>index===2?{name,messageId:'j2-native-success',latencyMs:42,anchor:{messageId:'j2-native-success'}}:name);if(c.journey==='J3')j3Sample(r);if(c.journey==='PARTIAL'){r.results=partialCheckpoints.map(name=>({name,status:'PASS'}));r.paging=samplePartialPaging();}return r;}
function j3Sample(r){
 const reason=r.profile==='MODERN'?'compact-history-without-flow-partition':'legacy-separated-roots-without-flow-partition';
 Object.assign(r,{status:'PARTIAL_NOT_J3_ACCEPTED',fullV27Acceptance:'NOT_ESTABLISHED',productionSnippetProfile:'DISABLED_NOT_CERTIFIED',workerExternalNetworkBlocked:true});
 r.steps=j3RequiredCheckpoints.map((name,index)=>({name,order:index+1,status:index>=12&&index<=14?'NOT_COVERED':'PASS',...(index>=12&&index<=14?{reason,productionSnippetProfile:'DISABLED_NOT_CERTIFIED'}:{}),...(index===0?{sidebarAvailable:false,sidebarLimitation:reason}:{})}));
}
const code=c=>['J1','J3','J4'].includes(c.journey)?2:0;
test('finite matrix covers both supported J1-J3 profiles, five J4 boundaries and separate partial slice',()=>{assert.equal(journeyMatrixCases.length,12);for(const j of ['J1','J2','J3'])assert.equal(journeyMatrixCases.filter(c=>c.journey===j).length,2);assert.equal(journeyMatrixCases.filter(c=>c.journey==='J4').length,5);});
test('each exact child result admitted without promoting scope',()=>{for(const c of journeyMatrixCases)assert.equal(admitMatrixReport(c,sample(c),code(c)).status,'PASS_SCOPED_CONTINUOUS_CASE');});
for(const key of ['sourceChangedDuringRun','buildManifestUnchanged','errors','steps','profile','realChatGPT'])test('negative control rejects corrupted '+key,()=>{const c=journeyMatrixCases[0],r=sample(c);r[key]={sourceChangedDuringRun:true,buildManifestUnchanged:false,errors:['oops'],steps:[],profile:'wrong',realChatGPT:'PASS'}[key];assert.throws(()=>admitMatrixReport(c,r,2));});
test('wrong exit, fabricated full J3, missing lifecycle repeat and wrong cut cannot be green',()=>{for(const c of journeyMatrixCases)assert.throws(()=>admitMatrixReport(c,sample(c),99));let c=journeyMatrixCases.find(c=>c.journey==='J3'),r=sample(c);r.status='PASS';assert.throws(()=>admitMatrixReport(c,r,0));c=journeyMatrixCases.find(c=>c.repeat);r=sample(c);r.repeatedReenable=[];assert.throws(()=>admitMatrixReport(c,r,2));r=sample(c);r.jointInterruptionBoundary='OTHER';assert.throws(()=>admitMatrixReport(c,r,2));});
test('inherited diagnostic/scenario flags cannot change the selected case',()=>{const c=journeyMatrixCases[0];assert.deepEqual(matrixEnvironment({PATH:'ok',FREE_CHROME_EXECUTABLE:'/chromium',FREE_J1_UPGRADE_TRACE:'1',FREE_J2_PROFILE:'MODERN',FREE_J3_CONTEXT_TRACE:'1',FREE_J4_AFTER_EVIDENCE:'1',J3_LAYOUT:'wrapped'},c),{PATH:'ok',FREE_CHROME_EXECUTABLE:'/chromium',FREE_J1_PROFILE:'LEGACY'});});
test('matrix requires exact rows and consistent source hashes, never full acceptance',()=>{const rows=journeyMatrixCases.map(c=>admitMatrixReport(c,sample(c),code(c)));const r=summarizeJourneyMatrix(rows);assert.equal(r.status,'PASS_SCOPED_OFFLINE_MATRIX');assert.equal(r.fullJ4,'NOT_ESTABLISHED');assert.equal(r.full81,'NOT_ESTABLISHED');for(const invalid of [rows.slice(1),[...rows.slice(1),rows[1]],rows.map((r,i)=>i? r:{...r,sourceHashes:{other:'hash'}}),rows.map((r,i)=>i?r:{...r,status:'FAIL_OR_NOT_RUN'})])assert.equal(summarizeJourneyMatrix(invalid).status,'INCOMPLETE_OR_FAILED');});
test('plan is NOT_RUN and cannot start browser without explicit opt-in',async()=>{const dir=await mkdtemp(join(tmpdir(),'j-matrix-plan-'));const r=await runJourneyMatrix(dir);assert.equal(r.status,'NOT_RUN');assert.equal(JSON.parse(await readFile(join(dir,'matrix.json'))).cases.length,12);});
test('partial runner uses portable temp/browser override and fails changed evidence',async()=>{const source=await readFile(new URL('./partial-package-mv3-browser.mjs',import.meta.url),'utf8');assert(!source.includes('/private/tmp/'));assert(source.includes('FREE_CHROME_EXECUTABLE'));assert(source.includes('tmpdir()'));assert(source.includes("report.status='SOURCE_CHANGED'"));assert(source.includes("assert.equal(report.workerExternalNetwork,'BLOCKED')"));assert(source.includes("startsWith(server.origin+'/')"));});
for(const c of journeyMatrixCases.filter(c=>c.journey==='J4')){
 test(c.id+' rejects each missing, duplicated, unknown or reordered checkpoint',()=>{
  const full=sample(c);
  for(let i=0;i<full.steps.length;i++){
   const missing=structuredClone(full);missing.steps.splice(i,1);assert.throws(()=>admitMatrixReport(c,missing,2),full.steps[i].name);
   const duplicate=structuredClone(full);duplicate.steps.splice(i,0,duplicate.steps[i]);assert.throws(()=>admitMatrixReport(c,duplicate,2),full.steps[i].name);
  }
  const truncated=structuredClone(full);truncated.steps=truncated.steps.slice(-2);assert.throws(()=>admitMatrixReport(c,truncated,2));
  const unknown=structuredClone(full);unknown.steps.splice(3,0,{name:'unexecuted-checkpoint',status:'PASS'});assert.throws(()=>admitMatrixReport(c,unknown,2));
  const reordered=structuredClone(full);[reordered.steps[0],reordered.steps[1]]=[reordered.steps[1],reordered.steps[0]];assert.throws(()=>admitMatrixReport(c,reordered,2));
 });
 test(c.id+' admits only correctly placed single optional native peer recovery',()=>{
  const r=sample(c),index=r.steps.findIndex(s=>s.name==='same-J4-existing-evidence-checksum-fault-real-UI-repair-revokes-activity-and-preserves-draft-assets');
  r.steps.splice(index,0,{name:j4OptionalPeerRecovery,status:'PASS'});assert.doesNotThrow(()=>admitMatrixReport(c,r,2));
  r.steps.splice(index,0,{name:j4OptionalPeerRecovery,status:'PASS'});assert.throws(()=>admitMatrixReport(c,r,2));
  const misplaced=sample(c);misplaced.steps.push({name:j4OptionalPeerRecovery,status:'PASS'});assert.throws(()=>admitMatrixReport(c,misplaced,2));
 });
}
test('J4 checkpoints remain tied to real runner declarations',async()=>{
 const files=['j4-package-journey.mjs','j4-evidence-interruption.mjs','j4-joint-interruption.mjs','j4-evidence-recovery.mjs','j4-codec-roundtrip.mjs','j4-repeat-reenable.mjs'];
 const source=(await Promise.all(files.map(file=>readFile(new URL(file,import.meta.url),'utf8')))).join('\n');
 for(const c of journeyMatrixCases.filter(c=>c.journey==='J4'))for(const name of j4RequiredCheckpoints(c))assert(source.includes("'"+name+"'"),name);
});
test('J4 rejects checkpoints copied from another boundary and invalid repeated cycle order',()=>{
 const native=journeyMatrixCases.find(c=>c.id==='j4-before-native'),other=journeyMatrixCases.find(c=>c.id==='j4-after-evidence'),r=sample(native);r.steps=sample(other).steps;assert.throws(()=>admitMatrixReport(native,r,2));
 const repeat=journeyMatrixCases.find(c=>c.repeat),bad=sample(repeat);bad.steps.find(s=>s.cycle===2).cycle=1;assert.throws(()=>admitMatrixReport(repeat,bad,2));
});

for(const c of journeyMatrixCases.filter(c=>c.journey==='J2'))test(c.id+' admits actual seven-string/one-object report and rejects malformed checkpoints',()=>{
 const full=sample(c);assert.equal(full.steps.filter(s=>typeof s==='string').length,7);assert.doesNotThrow(()=>admitMatrixReport(c,full,0));
 for(let i=0;i<8;i++){
  const missing=structuredClone(full);missing.steps.splice(i,1);assert.throws(()=>admitMatrixReport(c,missing,0));
  const reordered=structuredClone(full);[reordered.steps[i],reordered.steps[(i+1)%8]]=[reordered.steps[(i+1)%8],reordered.steps[i]];assert.throws(()=>admitMatrixReport(c,reordered,0));
  const badStatus=structuredClone(full);badStatus.steps[i]={...(typeof badStatus.steps[i]==='string'?{name:badStatus.steps[i]}:badStatus.steps[i]),status:'FAIL'};assert.throws(()=>admitMatrixReport(c,badStatus,0));
 }
 for(const mutate of [r=>r.steps[2]=r.steps[2].name,r=>r.steps[2].messageId='',r=>r.steps[2].latencyMs=-1,r=>r.steps[2].latencyMs=NaN,r=>r.steps[2].anchor=null,r=>r.steps[2].anchor.messageId='wrong',r=>r.steps[2].anchor.sentAt='2026-10-20',r=>r.steps[0]={name:r.steps[0],status:'PASS'}]){const r=structuredClone(full);mutate(r);assert.throws(()=>admitMatrixReport(c,r,0));}
});
test('J2 exact checkpoint names match actual runner declarations',async()=>{
 const source=await readFile(new URL('./j2-package-journey.mjs',import.meta.url),'utf8');
 for(const name of j2RequiredCheckpoints.slice(0,6))assert(source.includes("'"+name+"'"),name);
 assert(source.includes("['other','old-branch']"));assert(source.includes("negative+'-message-does-not-create-self-activity'"));
});

test('PARTIAL matrix rejects missing, duplicate, reordered checkpoints and incomplete paging',()=>{const c=journeyMatrixCases.find(c=>c.journey==='PARTIAL');for(let i=0;i<partialCheckpoints.length;i++){const r=sample(c);r.results.splice(i,1);assert.throws(()=>admitMatrixReport(c,r,0));}const duplicate=sample(c);duplicate.results[1]=duplicate.results[0];assert.throws(()=>admitMatrixReport(c,duplicate,0));const old=sample(c);old.results=old.results.filter((_,i)=>![1,2].includes(i));delete old.paging;assert.throws(()=>admitMatrixReport(c,old,0));const missing=sample(c);delete missing.paging.afterUnmount;assert.throws(()=>admitMatrixReport(c,missing,0));});

for(const c of journeyMatrixCases.filter(c=>c.journey==='J3'))test(c.id+' preserves exactly the three known coverage gaps without accepting a failed product step',()=>{
 const full=sample(c),row=admitMatrixReport(c,full,2);
 assert.equal(row.childStatus,'PARTIAL_NOT_J3_ACCEPTED');assert.equal(row.fullJ3,'NOT_ESTABLISHED');assert.equal(row.sidebar,'NOT_COVERED_NO_COMMON_NATIVE_NAV');
 assert.deepEqual(row.uncovered,full.steps.slice(12,15).map(({name,reason})=>({name,reason})));
 for(let i=0;i<full.steps.length;i++){
  const missing=structuredClone(full);missing.steps.splice(i,1);assert.throws(()=>admitMatrixReport(c,missing,2));
  const reordered=structuredClone(full);[reordered.steps[i],reordered.steps[(i+1)%16]]=[reordered.steps[(i+1)%16],reordered.steps[i]];assert.throws(()=>admitMatrixReport(c,reordered,2));
  for(const status of ['FAIL',i>=12&&i<=14?'PASS':'NOT_COVERED']){const bad=structuredClone(full);bad.steps[i].status=status;assert.throws(()=>admitMatrixReport(c,bad,2));}
 }
 for(const mutate of [r=>r.steps[0].sidebarAvailable=true,r=>r.steps[0].sidebarLimitation='other',r=>r.steps[12].reason='unknown-failure',r=>r.steps[13].productionSnippetProfile='CERTIFIED',r=>r.steps[14].order=13,r=>r.productionSnippetProfile='CERTIFIED',r=>r.fullV27Acceptance='PASS',r=>r.workerExternalNetworkBlocked=false,r=>r.cleanupErrors=['close-failed'],r=>r.sourceChangedDuringRun=true]){const bad=structuredClone(full);mutate(bad);assert.throws(()=>admitMatrixReport(c,bad,2));}
 const summary=summarizeJourneyMatrix([row],{selected:[c.id]});assert.equal(summary.status,'PASS_SCOPED_OFFLINE_MATRIX');assert.equal(summary.fullJ3,'NOT_ESTABLISHED');assert.equal(summary.realChatGPT,'NOT_RUN');assert.equal(summary.rows[0].uncovered.length,3);
});
test('J3 checkpoint admission stays tied to the actual runner, not a new acceptance journey',async()=>{
 const source=await readFile(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');
 for(const name of j3RequiredCheckpoints.filter(name=>!name.startsWith('native-fixture-permission-')))assert(source.includes("'"+name+"'"),name);
 assert(source.includes("for(const choice of ['allow','deny'])"));assert(source.includes("'native-fixture-permission-'+choice"));
 const c=journeyMatrixCases.find(c=>c.journey==='J3'),bad=sample(c);bad.profile='OTHER';assert.throws(()=>admitMatrixReport({...c,profile:'OTHER'},bad,2));
});
