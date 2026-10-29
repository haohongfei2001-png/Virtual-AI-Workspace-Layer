/** Independent current-use oracle. It never rewrites the historical UI10 verdict
 * and never starts a browser. A completed native journey is not full UI10,
 * physical input, real ChatGPT, or release acceptance.
 *
 * node tests/host/ui10-current-use-acceptance.mjs --report RAW.json --png-log RAW.log
 *   --source-package UNPACKED --expected-sha SHA --output NEW.json
 * The verified package supplies an independent complete source inventory. In CI
 * use this run's artifactDirectory/package/extension. An equivalent source package
 * may audit an archived report; its different package identity remains explicit.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {verifyHost} from '../../extension/package.mjs';
import {verifySourceCommit,sourceClosureHash} from './product-candidate-report.mjs';
import {inspectSyntheticPng} from './ui10-visual-png-log.mjs';

export const UI10_CURRENT_USE_CAPTURE_IDS=Object.freeze(['mv3-desktop-initial','mv3-narrow-dark-initial','mv3-desktop-long-list-end','mv3-narrow-dark-long-list-end']);
export const UI10_CURRENT_USE_REQUIRED_FIXTURES=Object.freeze([
 'tests/host/ui10-native-preflight.mjs','tests/host/ui10-admission-trace.mjs','tests/host/ui10-native-initial-layout.mjs',
 'tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs','tests/host/ui10-capture-preparation.mjs',
 'tests/host/ui10-native-member-rows.mjs','tests/host/ui10-native-progress.mjs','tests/host/ui10-native-surface.mjs',
 'tests/host/fixtures/host-scale-world.mjs','extension/package.mjs','tests/host/ui10-visual-png-log.mjs',
 'tests/host/ui10-native-budget.mjs','tests/host/ui10-populated-package-browser.mjs','tests/host/fixtures/ui10-populated-native.mjs',
 'tests/host/fixtures/host-scale-server.mjs','tests/host/fixtures/j3-modern.mjs','tests/host/fixtures/native.mjs',
 'tests/host/fixtures/native.css','tests/host/fixtures/legacy.html',
]);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HASH=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const requireFact=(condition,reason)=>{if(!condition)throw Error(reason);};
const equal=(a,b)=>isDeepStrictEqual(a,b);
const keys=value=>Object.keys(value??{}).sort();
const sameSet=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===actual.length&&equal([...actual].sort(),[...expected].sort());
const validHashes=value=>plain(value)&&Object.keys(value).length>0&&Object.entries(value).every(([key,value])=>key&&!key.startsWith('/')&&!key.split('/').includes('..')&&!/[\\\r\n\0]/.test(key)&&HASH.test(value));
const rowId=index=>'60000000-0000-4000-8000-'+index.toString(16).padStart(12,'0');
const rows=Array.from({length:64},(_,index)=>({id:rowId(index),membership:index<34?'PROJECT':'NONE',daysAgo:index>=17&&index<34||index===63?75:1,status:'OBSERVED_NATIVE'}));
const dimensions=[{width:1440,height:1000},{width:1440,height:520},{width:420,height:1000},{width:420,height:520}];
const viewportKey=v=>`${v?.width}/${v?.height}`;
const cells=dimensions.flatMap(v=>['light','dark'].map(colorScheme=>({...v,colorScheme})));
const cellKey=v=>`${viewportKey(v)}/${v?.colorScheme}`;
const nativeIds=['#prompt-textarea','#model-button','#tools-button','#composer input[type=file]','#composer button[type=submit]'];
const networkKeys=['session','accounts','currentDetail','nativeRoute','nativeMove'];
const networkPaths=['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27','/backend-api/conversation/:id','/native/route','/native/move-menu'];
const allowedRequests=['/','/native.css','/native.mjs','/native/route','/native/action',...networkPaths];

function inViewport(rect,viewport,minHeight=1){
 return plain(rect)&&['x','y','width','height'].every(k=>Number.isFinite(rect[k]))&&rect.width>0&&rect.height>=minHeight&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1&&Object.entries({left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height}).every(([key,value])=>!Object.hasOwn(rect,key)||Number.isFinite(rect[key])&&Math.abs(rect[key]-value)<0.01);
}
function nativeControls(sample,focus){
 requireFact(plain(sample)&&Array.isArray(sample.controls)&&sameSet(sample.controls.map(c=>c.id),nativeIds),'NATIVE_CONTROL_SET_INCOMPLETE');
 for(const control of sample.controls)requireFact(control.hit===true&&inViewport(control.rect,sample.viewport)&&(!focus||control.focused===true),'NATIVE_CONTROL_NOT_VISIBLE_HITTABLE_OR_FOCUSABLE');
 requireFact(Array.isArray(sample.headers)&&sample.headers.length===1&&inViewport(sample.headers[0],sample.viewport),'NATIVE_HEADER_GEOMETRY_INVALID');
 requireFact(sample.scroll?.x===0&&sample.scroll?.y===0&&sample.scroll.width===sample.viewport.width&&sample.scroll.height===sample.viewport.height,'NATIVE_VIEWPORT_OVERFLOW');
}

/** Strictly recover the four allowlisted synthetic captures, without reading any
 * source-supplied paths. A truncated or duplicate log cannot serve as evidence. */
export function decodeUi10CurrentUsePngLog(log){
 requireFact(typeof log==='string'&&Buffer.byteLength(log)<=32*1024*1024,'INVALID_PNG_LOG');
 const records=log.split(/\r?\n/).map(line=>{const i=line.indexOf('VAIWL_PNG_');return i<0?'':line.slice(i);}).filter(Boolean);
 const manifests=records.filter(line=>line.startsWith('VAIWL_PNG_MANIFEST '));requireFact(manifests.length===1,'PNG_MANIFEST_COUNT');
 const manifest=JSON.parse(manifests[0].slice('VAIWL_PNG_MANIFEST '.length));
 requireFact(manifest.protocol==='synthetic-png-log/1'&&manifest.visualVerdict==='NOT_REVIEWED'&&sameSet(manifest.images?.map(i=>i.id),UI10_CURRENT_USE_CAPTURE_IDS),'PNG_MANIFEST_SCOPE');
 const decoded=new Map();let expectedRecords=1,total=0;
 for(const item of manifest.images){
  requireFact(Number.isSafeInteger(item.chunks)&&item.chunks>0&&item.chunks<=64,'PNG_CHUNK_COUNT');
  const chunks=records.filter(line=>line.startsWith(`VAIWL_PNG_CHUNK ${item.id} `)).map(line=>line.split(' '));
  requireFact(chunks.length===item.chunks&&records.filter(line=>line===`VAIWL_PNG_BEGIN ${item.id} ${item.chunks}`).length===1&&records.filter(line=>line===`VAIWL_PNG_END ${item.id} ${item.sha256}`).length===1,'PNG_RECORDS_INCOMPLETE');
  chunks.forEach((chunk,index)=>requireFact(chunk.length===4&&chunk[2]===`${index+1}/${item.chunks}`&&/^[A-Za-z0-9+/=]+$/.test(chunk[3])&&chunk[3].length<=4096&&(index===chunks.length-1||chunk[3].length===4096),'PNG_CHUNK_ORDER_OR_ENCODING'));
  const base64=chunks.map(chunk=>chunk[3]).join(''),bytes=Buffer.from(base64,'base64'),png=inspectSyntheticPng(bytes);requireFact(bytes.toString('base64')===base64,'PNG_BASE64_NOT_CANONICAL');
  requireFact(['width','height','bytes','sha256'].every(key=>png[key]===item[key]),'PNG_BYTES_MISMATCH');
  decoded.set(item.id,{...png,metadata:item.metadata,bytes});expectedRecords+=item.chunks+2;total+=png.bytes;
 }
 requireFact(records.length===expectedRecords&&manifest.totalBytes===total,'PNG_LOG_EXTRA_OR_MISSING_RECORDS');
 return decoded;
}

/** Pure report contract. Independent expected hash inventories and decoded PNG
 * bytes are mandatory inputs, supplied by the collector after verification. */
export function evaluateUi10CurrentUseAcceptance(report,{expectedSourceCommit,expectedSourceHashes,expectedFixtureHashes,pngCaptures}={}){
 const r=report??{},checks=[];
 const check=(id,fn)=>{try{fn();checks.push({id,outcome:'PASS'});}catch(error){checks.push({id,outcome:'FAIL',reason:error instanceof Error?error.message:'INVALID_EVIDENCE'});}};
 check('completed-offline-current-use-run',()=>{
  requireFact(COMMIT.test(expectedSourceCommit)&&r.sourceCommit===expectedSourceCommit,'SOURCE_COMMIT_MISMATCH');
  requireFact(r.kind==='PACKAGED_MV3_NATIVE_UI10_POPULATED_RECONSTRUCTION'&&r.profile==='LEGACY'&&r.status==='PARTIAL_UI10_HISTORY_NOT_COVERED','NOT_FORMAL_COMPLETED_CURRENT_USE_REPORT');
  requireFact(r.coverage==='LOCAL_RECENT_USE_PAGINATION'&&r.historicalWindows==='NOT_COVERED_ALL_ROWS_OPENED_IN_THIS_JOURNEY','CURRENT_USE_SCOPE_MISMATCH');
  requireFact(r.realChatGPT==='NOT_RUN'&&r.physicalIME==='NOT_RUN'&&r.approvedGoldenComparison==='NOT_RUN'&&r.fullV27Acceptance==='NOT_ESTABLISHED','UNSUPPORTED_ACCEPTANCE_CLAIM');
  requireFact(r.finalized===true&&r.progress?.phase==='cleanup'&&r.progress.timedOut===false&&integer(r.progress.elapsedMs)&&Number.isSafeInteger(r.progress.deadlineMs)&&r.progress.elapsedMs<r.progress.deadlineMs&&r.progress.deadlineMs<=1320000,'INCOMPLETE_OR_TIMED_OUT');
  requireFact(!['error','failureProgress','failureFrames','sourceVerificationError','timeoutNetwork','initialVisualLogError','initialLayoutDiagnostics','oldCaptureDiagnostics','diagnosticOnly','diagnosticOutcome','tracePackage','traceError','traceVerificationError','tracePackageVerified','workerTrace','visitLimit','formalReportSuperseded','cleanupErrors','failureScreenshot'].some(key=>Object.hasOwn(r,key)),'RUN_FAILURE_OR_DIAGNOSTIC_PRESENT');
 });
 check('64-native-visits-and-independent-admission',()=>{
  requireFact(Array.isArray(r.visits)&&r.visits.length===64&&new Set(r.visits.map(v=>v.id)).size===64,'NATIVE_VISIT_SET_INCOMPLETE');
  r.visits.forEach((visit,index)=>requireFact(equal(visit,rows[index]),'NATIVE_VISIT_ID_MEMBERSHIP_OR_DATE_MISMATCH'));
  requireFact(r.admittedEvents===64&&r.admittedLocalUses===64,'ADMISSION_COUNTS_INCOMPLETE');
  requireFact(r.native?.nativeConversations===64&&r.native.nativeProjects===1,'NATIVE_INVENTORY_INCOMPLETE');
  requireFact(r.localUseSemantics==='Actual opens make all visited rows recent; original send timestamps and membership remain independently verified.','LOCAL_USE_MUST_NOT_BECOME_NEW_SEND');
 });
 check('eight-current-use-layout-cells',()=>{
  requireFact(sameSet(r.checks?.map(cellKey),cells.map(cellKey)),'LAYOUT_CELL_SET_INCOMPLETE');
  requireFact(typeof r.artifactDirectory==='string'&&r.artifactDirectory.startsWith('/')&&!r.artifactDirectory.split('/').includes('..'),'INVALID_ARTIFACT_DIRECTORY');
  for(const cell of r.checks)requireFact(cell.status==='PASS_CURRENT_USE_PAGINATION_ONLY'&&equal(cell.screenshots,[posix.join(r.artifactDirectory,`${cell.width}-${cell.height}-${cell.colorScheme}-tail.png`)]),'LAYOUT_CELL_NOT_COMPLETED');
 });
 check('native-controls-before-extension',()=>{
  requireFact(r.nativePreflight?.status==='PASS_NATIVE_FIXTURE_BEFORE_EXTENSION'&&sameSet(r.nativePreflight.results?.map(x=>viewportKey(x.viewport)),dimensions.map(viewportKey)),'NATIVE_PREFLIGHT_INCOMPLETE');
  for(const result of r.nativePreflight.results){requireFact(result.ownedSurfaces===0,'NATIVE_BASELINE_ALREADY_OWNED');nativeControls(result,true);}
 });
 check('initial-workspace-before-populated-visits',()=>{
  requireFact(r.initialWorkspacePreflight?.status==='PASS_BEFORE_POPULATED_VISITS'&&sameSet(r.initialWorkspacePreflight.results?.map(x=>viewportKey(x.viewport)),dimensions.map(viewportKey)),'INITIAL_WORKSPACE_PREFLIGHT_INCOMPLETE');
  for(const result of r.initialWorkspacePreflight.results){
   requireFact(result.status==='PASS_INITIAL_WORKSPACE_AND_NATIVE_FIRST_CLICK'&&result.hit===true&&inViewport(result.rect,result.viewport,96),'INITIAL_WORKSPACE_NOT_VISIBLE_OR_HITTABLE');
   requireFact(equal(result.nativeControls?.viewport,result.viewport)&&Number.isSafeInteger(result.nativeControls?.ownedSurfaces)&&result.nativeControls.ownedSurfaces>0,'INITIAL_WORKSPACE_NATIVE_BASELINE_MISMATCH');nativeControls(result.nativeControls,false);
  }
 });
 check('package-source-and-fixture-integrity',()=>{
  requireFact(validHashes(expectedSourceHashes)&&validHashes(r.sourceHashes)&&equal(r.sourceHashes,expectedSourceHashes)&&equal(r.sourceHashes,r.sourceHashesAfter)&&r.productSourceStable===true,'PRODUCT_SOURCE_CLOSURE_MISMATCH');
  requireFact(validHashes(expectedFixtureHashes)&&sameSet(keys(expectedFixtureHashes),UI10_CURRENT_USE_REQUIRED_FIXTURES)&&equal(r.testHashesBefore,expectedFixtureHashes)&&equal(r.testHashesBefore,r.testHashesAfter)&&r.fixtureStable===true,'FIXTURE_CLOSURE_MISMATCH');
  requireFact(HASH.test(r.buildManifestHash)&&r.buildManifestHash===r.buildManifestHashAfter,'BUILD_MANIFEST_CHANGED');
  requireFact(r.packageVerification?.status==='OFFLINE_HOST_RECONSTRUCTION'&&r.packageVerification.releaseStatus==='NOT_RELEASE_READY'&&Number.isSafeInteger(r.packageVerification.files)&&r.packageVerification.files>0,'PACKAGE_VERIFICATION_MISSING');
 });
 check('network-boundary-native-actions-and-cleanup',()=>{
  const guard=r.networkGuard,requests=r.native?.requests,actions=r.native?.actions;
  requireFact(r.cleanupOK===true&&guard?.mode==='DISPOSABLE_CHROME_REJECT_PROXY'&&guard.closed===true&&integer(guard.denied)&&plain(guard.counts)&&Object.values(guard.counts).every(integer)&&Object.values(guard.counts).reduce((sum,n)=>sum+n,0)===guard.denied,'NETWORK_GUARD_OR_CLEANUP_INCOMPLETE');
  requireFact(plain(requests)&&Object.values(requests).every(n=>integer(n)&&n>0)&&sameSet(keys(requests),[...new Set(allowedRequests)]),'UNEXPECTED_OR_MISSING_NATIVE_REQUESTS');
  requireFact(equal(actions,{model:8,navigate:65})&&requests['/native/action']===73&&requests['/native/move-menu']===30&&requests['/backend-api/conversation/:id']>=64,'UNEXPECTED_NATIVE_ACTION_OR_MISSING_MEMBERSHIP_PROOF');
  requireFact(sameSet(keys(r.progress?.network),networkKeys)&&networkKeys.every((key,index)=>r.progress.network[key]===requests[networkPaths[index]]),'FINAL_NETWORK_COUNTER_MISMATCH');
 });
 check('complete-bounded-phase-journal',()=>{
  requireFact(Array.isArray(r.checkpoints)&&r.checkpoints.length>0&&r.checkpoints.length<=512,'PHASE_JOURNAL_MISSING');
  let previous=-1;for(const point of r.checkpoints){requireFact(integer(point.elapsedMs)&&point.elapsedMs>=previous&&point.elapsedMs<=r.progress.elapsedMs&&sameSet(keys(point.network),networkKeys)&&Object.values(point.network).every(integer),'PHASE_JOURNAL_INVALID');previous=point.elapsedMs;}
  const unique=(phase,index=null)=>{const matches=r.checkpoints.map((point,position)=>({point,position})).filter(({point})=>point.phase===phase&&point.index===index);requireFact(matches.length===1,'PHASE_MISSING_OR_DUPLICATE:'+phase);return matches[0].position;};
  let position=-1;for(const phase of ['setup','browser-launch','native-viewport-preflight','initial-workspace-preflight','project-membership']){const next=unique(phase);requireFact(next>position,'PREFLIGHT_PHASE_ORDER');position=next;}
  for(let index=0;index<64;index++)for(const phase of ['visit-start','native-click','evidence-admission',...(index>=34?['none-membership']:[]),'visit-complete']){const next=unique(phase,index);requireFact(next>position,'VISIT_PHASE_ORDER');position=next;}
  requireFact(['visit-start','native-click','evidence-admission','visit-complete'].every(phase=>r.checkpoints.filter(p=>p.phase===phase).length===64)&&r.checkpoints.filter(p=>p.phase==='none-membership').length===30,'VISIT_PHASE_COUNT');
  const admitted=unique('verify-admission');requireFact(admitted>position,'ADMISSION_PHASE_ORDER');position=admitted;
  for(let index=0;index<8;index++){const next=unique('visual-cell',index);requireFact(next>position,'VISUAL_PHASE_ORDER');position=next;}
  requireFact(r.checkpoints.filter(p=>p.phase==='visual-cell').length===8&&unique('cleanup')===r.checkpoints.length-1&&unique('cleanup')>position,'CLEANUP_PHASE_ORDER');
  const last=r.checkpoints.at(-1);requireFact(last.elapsedMs===r.progress.elapsedMs&&equal(last.network,r.progress.network),'FINAL_PHASE_MISMATCH');
 });
 check('four-bound-and-decodable-png-captures',()=>{
  requireFact(r.initialVisualLogStatus==='EMITTED_NOT_VISUALLY_REVIEWED','PNG_LOG_NOT_COMPLETE');
  const captures=[...(r.initialVisualCaptures??[]),...(r.populatedVisualCaptures??[])];
  requireFact(r.initialVisualCaptures?.length===2&&r.populatedVisualCaptures?.length===2&&sameSet(captures.map(c=>c.id),UI10_CURRENT_USE_CAPTURE_IDS)&&pngCaptures instanceof Map&&sameSet([...pngCaptures.keys()],UI10_CURRENT_USE_CAPTURE_IDS),'PNG_CAPTURE_SET_INCOMPLETE');
  const browsers=new Set(),historyTimes=new Set();
  for(const capture of captures){
   const image=pngCaptures.get(capture.id),png=inspectSyntheticPng(image.bytes),m=capture.metadata,narrow=capture.id.includes('narrow-dark'),initial=capture.id.endsWith('-initial'),viewport={width:narrow?420:1440,height:1000};
   requireFact(['width','height','bytes','sha256'].every(key=>png[key]===capture[key])&&equal(image.metadata,m),'PNG_CAPTURE_BYTES_OR_METADATA_MISMATCH');
   requireFact(m?.lane==='ACTUAL_MV3_OFFLINE'&&m.synthetic===true&&m.profile==='LEGACY'&&m.scene===(initial?'native-populated-initial':'long-list-end')&&equal(m.viewport,viewport)&&capture.width===viewport.width&&capture.height===viewport.height&&m.theme===(narrow?'dark':'light')&&m.dpr===1&&m.zoom===1,'PNG_CAPTURE_SCOPE_OR_GEOMETRY_MISMATCH');
   requireFact(m.buildManifestHash===r.buildManifestHash&&m.sourceSetSha256===hash(JSON.stringify(r.sourceHashes))&&m.fixtureSetSha256===hash(JSON.stringify(r.testHashesBefore)),'PNG_CAPTURE_SOURCE_BINDING_MISMATCH');
   requireFact(typeof m.browserVersion==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(m.browserVersion)&&integer(m.historyNow)&&m.historyNow>0,'PNG_BROWSER_OR_CLOCK_MISSING');browsers.add(m.browserVersion);historyTimes.add(m.historyNow);
   if(initial){
    requireFact(m.layoutPairVerified===true&&m.currentRows===5&&Array.isArray(m.currentIds)&&m.currentIds.length===5&&new Set(m.currentIds).size===5&&m.currentIds.every(id=>rows.slice(0,34).some(r=>r.id===id))&&m.oldRows===0&&m.devicePixelRatio===1,'INITIAL_PAGINATION_OR_LAYOUT_PAIR_INVALID');
    requireFact(m.outerLayout?.connected===true&&m.outerLayout.visible===true&&equal(m.outerLayout.viewport,viewport)&&inViewport(m.outerLayout.rect,viewport,96)&&m.frameViewport?.width===m.outerLayout.rect.width&&m.frameViewport?.height===m.outerLayout.rect.height&&m.boardBounds?.width===m.frameViewport.width&&m.boardBounds?.height===m.frameViewport.height,'INITIAL_CAPTURE_LAYOUT_INVALID');
    const t=m.layoutCaptureTiming,times=[t?.layoutReadyAt,t?.screenshotStartedAt,t?.layoutVerifiedAt].map(Date.parse);requireFact(times.every(Number.isFinite)&&times[0]<=times[1]&&times[1]<=times[2],'INITIAL_CAPTURE_TIMING_INVALID');
   }
  }
  requireFact(browsers.size===1&&historyTimes.size===1,'PNG_CAPTURE_RUN_CONFLICT');
 });
 const pass=checks.every(c=>c.outcome==='PASS');
 return {schema:'vaiwl-ui10-current-use-acceptance-v1',scope:'APPROVED_FREE_PERSONAL_CURRENT_USE_SUBCONTRACT',sourceCommit:r.sourceCommit??null,status:pass?'PASS_CURRENT_USE_MV3_SUBCONTRACT':'FAIL_CURRENT_USE_EVIDENCE',outcome:pass?'PASS':'FAIL',rawStatus:r.status??'NOT_RUN',checks,
  coverage:pass?{nativeVisits:64,project:34,noProject:30,currentUseLayoutCells:8,verifiedPngCaptures:4}:null,
  visualReview:'NOT_RUN_BY_AUTOMATED_ORACLE',historicalWindows:r.historicalWindows??'NOT_RUN',historicalApplicability:'CANCELLED_AS_PERSONAL_GATE_NOT_A_RELEASE_DEBT',realChatGPT:'NOT_RUN',physicalIME:'NOT_RUN',fullV27Acceptance:'NOT_ESTABLISHED',publicRelease:'NOT_ESTABLISHED',
  limits:['Only the completed local recent-use ingestion and pagination subcontract.','Four transported PNGs are integrity checked; not all eight layout cells have a retained PNG or visual review.','Original send evidence and separately observed local use remain distinct.','Raw historical PARTIAL is retained; this is not whole-product or real Mac acceptance.']};
}

function gitHashes(paths,commit,repositoryRoot){
 requireFact(COMMIT.test(commit),'INVALID_EXPECTED_COMMIT');
 const data=execFileSync('git',['cat-file','--batch'],{cwd:repositoryRoot,input:paths.map(path=>commit+':'+path).join('\n')+'\n',maxBuffer:32*1024*1024}),result={};let offset=0;
 for(const path of paths){const end=data.indexOf(10,offset),header=data.subarray(offset,end).toString('utf8'),match=/^[a-f0-9]{40} blob (\d+)$/.exec(header);requireFact(!!match,'MISSING_COMMITTED_FIXTURE');const start=end+1,size=Number(match[1]);result[path]=hash(data.subarray(start,start+size));offset=start+size+1;}requireFact(offset===data.length,'INVALID_GIT_FIXTURE_BATCH');return result;
}
export function collectUi10CurrentUseAcceptance({reportPath,logPath,sourcePackage,expectedSourceCommit,repositoryRoot=ROOT}){
 const reportBytes=readFileSync(reportPath),logBytes=readFileSync(logPath),report=JSON.parse(reportBytes);
 const packageVerification=verifyHost(sourcePackage),manifestBytes=readFileSync(resolve(sourcePackage,'build-manifest.json')),manifest=JSON.parse(manifestBytes);
 verifySourceCommit(manifest.sourceHashes,expectedSourceCommit,repositoryRoot);
 const fixtureHashes=gitHashes([...UI10_CURRENT_USE_REQUIRED_FIXTURES],expectedSourceCommit,repositoryRoot);
 const result=evaluateUi10CurrentUseAcceptance(report,{expectedSourceCommit,expectedSourceHashes:manifest.sourceHashes,expectedFixtureHashes:fixtureHashes,pngCaptures:decodeUi10CurrentUsePngLog(logBytes.toString('utf8'))});
 const sameRunPackage=typeof report.artifactDirectory==='string'&&resolve(sourcePackage)===resolve(report.artifactDirectory,'package/extension'),samePackageIdentity=hash(manifestBytes)===report.buildManifestHash&&equal(packageVerification,report.packageVerification);
 if(sameRunPackage&&!samePackageIdentity){result.checks.push({id:'same-run-package-bytes',outcome:'FAIL',reason:'RUN_PACKAGE_BYTES_MISMATCH'});result.outcome='FAIL';result.status='FAIL_CURRENT_USE_EVIDENCE';result.coverage=null;}
 return {...result,sourceClosureSHA256:sourceClosureHash(manifest.sourceHashes),fixtureClosureSHA256:sourceClosureHash(fixtureHashes),evidence:{report:{path:resolve(reportPath),sha256:hash(reportBytes)},pngLog:{path:resolve(logPath),sha256:hash(logBytes)}},sourceReference:{unpacked:resolve(sourcePackage),buildManifestSHA256:hash(manifestBytes),packageVerification,sameRunPackage,runPackageBytesVerifiedHere:sameRunPackage&&samePackageIdentity,note:sameRunPackage?'Actual run package compared with the original report identity.':'Equivalent production sources verified; the archived run package verification remains the original runner record.'},oracleSourceSHA256:hash(readFileSync(fileURLToPath(import.meta.url)))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),expected=['--report','--png-log','--source-package','--expected-sha','--output'];
  if(args.length===1&&args[0]==='--help')console.log('Usage: node tests/host/ui10-current-use-acceptance.mjs --report RAW.json --png-log RAW.log --source-package UNPACKED --expected-sha SHA --output NEW.json');
  else{
   requireFact(args.length===10&&sameSet(args.filter((_,i)=>i%2===0),expected),'INVALID_CLI_ARGUMENTS');const values=Object.fromEntries(expected.map(flag=>[flag,args[args.indexOf(flag)+1]]));
   const result=collectUi10CurrentUseAcceptance({reportPath:values['--report'],logPath:values['--png-log'],sourcePackage:values['--source-package'],expectedSourceCommit:values['--expected-sha']});const output=resolve(values['--output']);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({output,status:result.status,rawStatus:result.rawStatus,sourceCommit:result.sourceCommit,failedChecks:result.checks.filter(c=>c.outcome!=='PASS')}));if(result.outcome!=='PASS')process.exitCode=1;
  }
 }catch(error){console.error(error instanceof Error?error.message:'CURRENT_USE_ORACLE_FAILED');process.exitCode=1;}
}
