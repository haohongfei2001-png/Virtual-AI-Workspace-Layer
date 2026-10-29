import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {inspectSyntheticPng,syntheticPngLogRecords} from './ui10-visual-png-log.mjs';
import {UI10_CURRENT_USE_REQUIRED_FIXTURES,UI10_CURRENT_USE_CAPTURE_IDS,decodeUi10CurrentUsePngLog,evaluateUi10CurrentUseAcceptance} from './ui10-current-use-acceptance.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex'),clone=structuredClone;
function png(width,height){
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,8+data.length)),8+data.length);return b;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc((width*4+1)*height))),chunk('IEND',Buffer.alloc(0))]);
}
const pixels=new Map([[1440,png(1440,1000)],[420,png(420,1000)]]);
const rowId=index=>'60000000-0000-4000-8000-'+index.toString(16).padStart(12,'0');
const dimensions=[{width:1440,height:1000},{width:1440,height:520},{width:420,height:1000},{width:420,height:520}];
function native(viewport,ownedSurfaces,focused){return {viewport:clone(viewport),ownedSurfaces,controls:['#prompt-textarea','#model-button','#tools-button','#composer input[type=file]','#composer button[type=submit]'].map((id,i)=>({id,rect:{x:20+i*60,y:420,width:40,height:30},hit:true,focused})),headers:[{x:0,y:0,width:viewport.width,height:64}],scroll:{x:0,y:0,...viewport}};}
function fixture(){
 const sources={'src/navigation/navigation.mjs':hash('SYNTHETIC_UNIT_SOURCE_ONLY'),'extension/build.mjs':hash('SYNTHETIC_UNIT_BUILDER_ONLY')},fixtures=Object.fromEntries(UI10_CURRENT_USE_REQUIRED_FIXTURES.map(path=>[path,hash(path)])),sha='a'.repeat(40),manifest=hash('SYNTHETIC_UNIT_MANIFEST_ONLY');
 const network={session:194,accounts:194,currentDetail:128,nativeRoute:67,nativeMove:30},checkpoints=[];
 const checkpoint=(phase,index=null)=>checkpoints.push({phase,index,network:clone(network),elapsedMs:checkpoints.length+1});
 for(const phase of ['setup','browser-launch','native-viewport-preflight','initial-workspace-preflight','project-membership'])checkpoint(phase);
 for(let i=0;i<64;i++)for(const phase of ['visit-start','native-click','evidence-admission',...(i>=34?['none-membership']:[]),'visit-complete'])checkpoint(phase,i);
 checkpoint('verify-admission');for(let i=0;i<8;i++)checkpoint('visual-cell',i);checkpoint('cleanup');
 const report={kind:'PACKAGED_MV3_NATIVE_UI10_POPULATED_RECONSTRUCTION',sourceCommit:sha,profile:'LEGACY',status:'PARTIAL_UI10_HISTORY_NOT_COVERED',realChatGPT:'NOT_RUN',physicalIME:'NOT_RUN',approvedGoldenComparison:'NOT_RUN',fullV27Acceptance:'NOT_ESTABLISHED',coverage:'LOCAL_RECENT_USE_PAGINATION',historicalWindows:'NOT_COVERED_ALL_ROWS_OPENED_IN_THIS_JOURNEY',finalized:true,
  progress:{...clone(checkpoints.at(-1)),deadlineMs:1320000,timedOut:false},checkpoints,
  visits:Array.from({length:64},(_,i)=>({id:rowId(i),membership:i<34?'PROJECT':'NONE',daysAgo:i>=17&&i<34||i===63?75:1,status:'OBSERVED_NATIVE'})),admittedEvents:64,admittedLocalUses:64,localUseSemantics:'Actual opens make all visited rows recent; original send timestamps and membership remain independently verified.',
  artifactDirectory:'/synthetic-unit-only',checks:dimensions.flatMap(v=>['light','dark'].map(colorScheme=>({...v,colorScheme,status:'PASS_CURRENT_USE_PAGINATION_ONLY',screenshots:[`/synthetic-unit-only/${v.width}-${v.height}-${colorScheme}-tail.png`]}))),
  nativePreflight:{status:'PASS_NATIVE_FIXTURE_BEFORE_EXTENSION',results:dimensions.map(v=>native(v,0,true))},
  initialWorkspacePreflight:{status:'PASS_BEFORE_POPULATED_VISITS',results:dimensions.map(viewport=>({status:'PASS_INITIAL_WORKSPACE_AND_NATIVE_FIRST_CLICK',viewport:clone(viewport),rect:{x:10,y:70,width:viewport.width-20,height:200},hit:true,nativeControls:native(viewport,4,null)}))},
  sourceHashes:clone(sources),sourceHashesAfter:clone(sources),productSourceStable:true,testHashesBefore:clone(fixtures),testHashesAfter:clone(fixtures),fixtureStable:true,buildManifestHash:manifest,buildManifestHashAfter:manifest,packageVerification:{status:'OFFLINE_HOST_RECONSTRUCTION',releaseStatus:'NOT_RELEASE_READY',files:203},
  native:{nativeConversations:64,nativeProjects:1,requests:{'/':2,'/native.css':2,'/native.mjs':2,'/native/route':67,'/native/action':73,'/api/auth/session':194,'/backend-api/accounts/check/v4-2023-04-27':194,'/backend-api/conversation/:id':128,'/native/move-menu':30},actions:{model:8,navigate:65}},networkGuard:{mode:'DISPOSABLE_CHROME_REJECT_PROXY',closed:true,denied:1,counts:{'CONNECT example.com':1}},cleanupOK:true,
  initialVisualCaptures:[],populatedVisualCaptures:[],initialVisualLogStatus:'EMITTED_NOT_VISUALLY_REVIEWED'};
 const captures=UI10_CURRENT_USE_CAPTURE_IDS.map(id=>{
  const initial=id.endsWith('-initial'),narrow=id.includes('narrow-dark'),width=narrow?420:1440,bytes=pixels.get(width),viewport={width,height:1000},bounds={x:0,y:0,width,height:700};
  const metadata={lane:'ACTUAL_MV3_OFFLINE',synthetic:true,scene:initial?'native-populated-initial':'long-list-end',viewport,theme:narrow?'dark':'light',profile:'LEGACY',zoom:1,dpr:1,browserVersion:'156.0.8078.4',buildManifestHash:manifest,sourceSetSha256:hash(JSON.stringify(sources)),fixtureSetSha256:hash(JSON.stringify(fixtures)),historyNow:1793300328462,...(initial?{layoutPairVerified:true,currentRows:5,currentIds:[33,32,31,30,29].map(rowId),oldRows:0,devicePixelRatio:1,outerLayout:{connected:true,visible:true,viewport:clone(viewport),rect:{...bounds,y:76}},frameViewport:{width,height:700},boardBounds:bounds,layoutCaptureTiming:{layoutReadyAt:'2026-10-29T19:14:30.000Z',screenshotStartedAt:'2026-10-29T19:14:30.000Z',layoutVerifiedAt:'2026-10-29T19:14:30.100Z'}}:{})};
  const capture={id,...inspectSyntheticPng(bytes),metadata};(initial?report.initialVisualCaptures:report.populatedVisualCaptures).push(capture);return {id,bytes,metadata:clone(metadata)};
 });
 const log=syntheticPngLogRecords(captures).map(line=>'2026-10-29T00:00:00Z '+line).join('\n');
 return {report,log,options:{expectedSourceCommit:sha,expectedSourceHashes:sources,expectedFixtureHashes:fixtures,pngCaptures:decodeUi10CurrentUsePngLog(log)}};
}
const base=fixture();
function fresh(){return {report:clone(base.report),options:{...base.options,expectedSourceHashes:clone(base.options.expectedSourceHashes),expectedFixtureHashes:clone(base.options.expectedFixtureHashes),pngCaptures:new Map([...base.options.pngCaptures].map(([id,v])=>[id,{...v,metadata:clone(v.metadata),bytes:Buffer.from(v.bytes)}]))}};}
function rejected(change,checkId){const {report,options}=fresh();change(report,options);const verdict=evaluateUi10CurrentUseAcceptance(report,options);assert.equal(verdict.outcome,'FAIL');assert.equal(verdict.coverage,null);if(checkId)assert.equal(verdict.checks.find(c=>c.id===checkId)?.outcome,'FAIL');}

test('scoped current-use success retains original PARTIAL and does not claim visual/live/full acceptance',()=>{
 const {report,options}=fresh(),before=JSON.stringify(report),r=evaluateUi10CurrentUseAcceptance(report,options);
 assert.equal(r.status,'PASS_CURRENT_USE_MV3_SUBCONTRACT');assert.equal(r.rawStatus,'PARTIAL_UI10_HISTORY_NOT_COVERED');assert.deepEqual(r.coverage,{nativeVisits:64,project:34,noProject:30,currentUseLayoutCells:8,verifiedPngCaptures:4});assert.equal(r.visualReview,'NOT_RUN_BY_AUTOMATED_ORACLE');assert.equal(r.realChatGPT,'NOT_RUN');assert.equal(r.physicalIME,'NOT_RUN');assert.equal(r.fullV27Acceptance,'NOT_ESTABLISHED');assert.equal(r.historicalApplicability,'CANCELLED_AS_PERSONAL_GATE_NOT_A_RELEASE_DEBT');assert.equal(JSON.stringify(report),before);
});
test('status words without the run evidence cannot pass',()=>{
 const r=evaluateUi10CurrentUseAcceptance({status:'PARTIAL_UI10_HISTORY_NOT_COVERED',coverage:'LOCAL_RECENT_USE_PAGINATION'});assert.equal(r.outcome,'FAIL');assert(r.checks.every(c=>c.outcome==='FAIL'));
});
test('different SHA, diagnostic run, timeout, source error and false full acceptance fail closed',()=>{
 for(const change of [r=>r.sourceCommit='b'.repeat(40),r=>r.kind='UI10_ADMISSION_TRACE',r=>r.diagnosticOnly=true,r=>r.progress.timedOut=true,r=>r.progress.elapsedMs=r.progress.deadlineMs,r=>r.error='failed',r=>r.sourceVerificationError='failed',r=>r.physicalIME='PASS',r=>r.status='PASS'])rejected(change,'completed-offline-current-use-run');
});
test('64 visits must be unique actual IDs with the correct PROJECT/NONE and original date split',()=>{
 for(const change of [r=>r.visits.pop(),r=>r.visits[2]=clone(r.visits[1]),r=>r.visits[34].membership='PROJECT',r=>r.visits[17].daysAgo=1,r=>r.visits[63].status='SEEDED',r=>r.admittedEvents=63,r=>r.admittedLocalUses=63,r=>r.native.nativeProjects=0])rejected(change,'64-native-visits-and-independent-admission');
});
test('eight repeated green cells do not substitute for the full size/theme Cartesian set',()=>{
 for(const change of [r=>r.checks.pop(),r=>r.checks[7]=clone(r.checks[0]),r=>r.checks[7].colorScheme='system',r=>r.checks[1].status='PASS',r=>r.checks[1].screenshots=[]])rejected(change,'eight-current-use-layout-cells');
});
test('native preflight requires every control, hit target, focus and viewport geometry',()=>{
 for(const change of [r=>r.nativePreflight.results.pop(),r=>r.nativePreflight.results[0].controls[4].id='#tools-button',r=>r.nativePreflight.results[0].controls[0].hit=false,r=>r.nativePreflight.results[0].controls[0].focused=false,r=>r.nativePreflight.results[2].controls[0].rect.x=500,r=>r.nativePreflight.results[0].ownedSurfaces=1,r=>r.nativePreflight.results[0].scroll.width=1500])rejected(change,'native-controls-before-extension');
});
test('initial workspace plus unobscured native controls are required before populated visits',()=>{
 for(const change of [r=>r.initialWorkspacePreflight.results[0].hit=false,r=>r.initialWorkspacePreflight.results[0].rect.height=0,r=>r.initialWorkspacePreflight.results[0].nativeControls.controls[1].hit=false,r=>r.initialWorkspacePreflight.results[0].nativeControls.ownedSurfaces=0,r=>r.initialWorkspacePreflight.results[0].nativeControls.viewport.width=420])rejected(change,'initial-workspace-before-populated-visits');
});
test('before/after self-consistency cannot omit or replace independent source and fixture inventory',()=>{
 for(const change of [r=>{delete r.sourceHashes['extension/build.mjs'];delete r.sourceHashesAfter['extension/build.mjs'];},r=>{r.sourceHashes['extension/build.mjs']='0'.repeat(64);r.sourceHashesAfter=clone(r.sourceHashes);},r=>{delete r.testHashesBefore['tests/host/fixtures/native.mjs'];delete r.testHashesAfter['tests/host/fixtures/native.mjs'];},r=>{r.testHashesBefore['tests/host/fixtures/native.mjs']='0'.repeat(64);r.testHashesAfter=clone(r.testHashesBefore);},r=>r.buildManifestHashAfter='0'.repeat(64),r=>r.fixtureStable=false,r=>r.packageVerification.status='PASS'])rejected(change,'package-source-and-fixture-integrity');
});
test('send, unexpected endpoint, dropped network accounting and cleanup failure block acceptance',()=>{
 for(const change of [r=>r.native.actions.send=1,r=>r.native.requests['/backend-api/private']=1,r=>r.native.requests['/native/move-menu']=29,r=>r.progress.network.currentDetail=127,r=>r.networkGuard.closed=false,r=>r.networkGuard.denied=2,r=>r.cleanupOK=false])rejected(change,'network-boundary-native-actions-and-cleanup');
});
test('phase journal rejects missing/duplicate membership, visits, layout cells and early cleanup',()=>{
 for(const change of [r=>r.checkpoints.splice(r.checkpoints.findIndex(p=>p.phase==='none-membership'),1),r=>r.checkpoints.splice(r.checkpoints.findIndex(p=>p.phase==='visit-complete'),1),r=>r.checkpoints[4]=clone(r.checkpoints[3]),r=>r.checkpoints.find(p=>p.phase==='visual-cell').index=7,r=>r.checkpoints.at(-1).phase='verify-admission',r=>r.checkpoints[8].elapsedMs=0])rejected(change,'complete-bounded-phase-journal');
});
test('a missing/corrupt PNG or a screenshot from another package/run cannot pass',()=>{
 for(const change of [r=>r.populatedVisualCaptures.pop(),(r,o)=>o.pngCaptures.delete('mv3-desktop-initial'),(r,o)=>{o.pngCaptures.get('mv3-desktop-initial').bytes[33]^=1;},r=>r.initialVisualCaptures[0].sha256='0'.repeat(64),r=>r.populatedVisualCaptures[0].metadata.buildManifestHash='0'.repeat(64),r=>r.initialVisualCaptures[0].metadata.sourceSetSha256='0'.repeat(64)])rejected(change,'four-bound-and-decodable-png-captures');
});
test('self-consistent initial screenshot metadata still requires actual layout and five-row pagination',()=>{
 for(const change of [m=>m.currentRows=17,m=>m.currentIds[4]=m.currentIds[0],m=>m.oldRows=1,m=>m.layoutPairVerified=false,m=>m.outerLayout.visible=false,m=>m.frameViewport.width--,m=>m.layoutCaptureTiming.layoutVerifiedAt='2026-10-29T19:14:29.000Z'])rejected((r,o)=>{change(r.initialVisualCaptures[0].metadata);o.pngCaptures.get('mv3-desktop-initial').metadata=clone(r.initialVisualCaptures[0].metadata);},'four-bound-and-decodable-png-captures');
});
test('PNG transport requires one complete manifest, ordered chunks, end hashes and no extra records',()=>{
 const lines=base.log.split('\n'),chunk=lines.findIndex(l=>l.includes('VAIWL_PNG_CHUNK ')),end=lines.findIndex(l=>l.includes('VAIWL_PNG_END '));
 assert.equal(decodeUi10CurrentUsePngLog(base.log).size,4);
 for(const modified of [lines.slice(1),[...lines,lines[0]],lines.filter((_,i)=>i!==chunk),lines.filter((_,i)=>i!==end),lines.map((line,i)=>i===chunk?line.replace('1/','2/'):line),[...lines,'VAIWL_PNG_EXTRA arbitrary']])assert.throws(()=>decodeUi10CurrentUsePngLog(modified.join('\n')));
});
