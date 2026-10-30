import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PRODUCT_CASES,productCandidateReport,sourceClosureHash,verifySourceCommit} from './product-candidate-report.mjs';
import {interpretProductEvidence,createProductRunReceipt,validateProductRunReceipt,interpretPersonalUXAcceptance,PERSONAL_UI10_CHECKS} from './product-candidate-gate.mjs';
const candidate={codeSHA:'a'.repeat(40),sourceClosureSHA256:'b'.repeat(64),packageSHA256:'c'.repeat(64),contentFingerprint:'d'.repeat(64),backend:'document-flow',authorityMode:'BROWSER_LOCAL',profileRevision:10,packageKind:'HOST_IMPLEMENTATION_UNVERIFIED',origin:'https://chatgpt.com'};
const offlineModes={'UI10-LEGACY':'EXPLICIT_OFFLINE_C3','UI10-MODERN':'EXPLICIT_OFFLINE_C2_CONVERSATION','UI10-PARTIAL':'EXPLICIT_OFFLINE_C3','existing-snippet-business':'EXPLICIT_OFFLINE_C3','historical-upgrade-assets':'EXPLICIT_OFFLINE_C3'};
const observations=()=>PRODUCT_CASES.map(({journey,level})=>({journey,identity:{...candidate,...(level==='L2'?{authorityMode:offlineModes[journey]??'BROWSER_LOCAL',packageKind:'OFFLINE_HOST_RECONSTRUCTION',origin:'http://127.0.0.1:1234'}:{})},outcome:'PASS',exitCode:0,evidencePath:'anonymous-fixture.json',evidenceSHA256:'1'.repeat(64),fixtureSetSHA256:'e'.repeat(64),browserVersion:'156.0.8078.4',viewport:{width:1400,height:900},evidenceClass:level==='L3'?'LIVE_AUTHORIZED_CHATGPT':level==='L2'?'PACKAGED_MV3_SYNTHETIC_HOST':journey==='node-contracts'?'NODE_CONTRACTS':'BROWSER_MECHANISM_ONLY'}));
test('missing and early-exit cases stay NOT_RUN, with separate levels',()=>{
 const r=productCandidateReport({candidate,observations:observations().slice(0,2)});
 assert.equal(r.levels.L1.outcome,'PASS');assert.equal(r.levels.L2.outcome,'NOT_RUN');assert.equal(r.levels.L3.outcome,'NOT_RUN');assert.equal(r.fullFree,'NOT_ACCEPTED');assert.equal(r.personalDailyCandidate,'NOT_READY');
});
test('PARTIAL, missing browser provenance and other source evidence cannot pass',()=>{
 const rows=observations();rows[2].outcome='PARTIAL';delete rows[3].browserVersion;rows[4].identity.sourceClosureSHA256='f'.repeat(64);
 const r=productCandidateReport({candidate,observations:rows});
 assert.equal(r.levels.L2.outcome,'PARTIAL');assert.equal(r.cases[2].blockedBy,'PARTIAL_COVERAGE');assert.equal(r.cases[3].blockedBy,'INCOMPLETE_BROWSER_PROVENANCE');assert.equal(r.cases[4].blockedBy,'DIFFERENT_SOURCE_CANDIDATE');assert.equal(r.fullFree,'NOT_ACCEPTED');
});
test('failed commands and missing evidence receipts fail even if producer says PASS',()=>{
 const rows=observations();rows[0].exitCode=1;rows[1].evidenceSHA256=null;
 const r=productCandidateReport({candidate,observations:rows});assert.equal(r.levels.L1.outcome,'FAIL');assert.equal(r.cases[0].blockedBy,'MISSING_SUCCESS_RECEIPT');assert.equal(r.cases[1].outcome,'FAIL');
});
test('source restrictions remain independent of executed product cases and publication',()=>{
 const r=productCandidateReport({candidate,observations:observations(),blockedBy:['BLOCKED_SOURCE_CONTRACT']});
 assert.equal(r.personalDailyCandidate,'READY');assert.equal(r.fullFree,'NOT_ACCEPTED');assert.equal(r.publicRelease,'NOT_AUTHORIZED');
});
test('duplicate or unknown journeys and malformed candidate identity are rejected',()=>{
 assert.throws(()=>productCandidateReport({candidate,observations:[observations()[0],observations()[0]]}));
 assert.throws(()=>productCandidateReport({candidate,observations:[{journey:'invented',outcome:'PASS'}]}));
 assert.throws(()=>productCandidateReport({candidate:{},observations:[]}));
 assert.throws(()=>productCandidateReport({candidate:{...candidate,packageKind:'OFFLINE_HOST_RECONSTRUCTION'},observations:[]}));
 assert.equal(sourceClosureHash({b:'2'.repeat(64),a:'1'.repeat(64)}),sourceClosureHash({a:'1'.repeat(64),b:'2'.repeat(64)}));
 assert.throws(()=>sourceClosureHash({a:'invalid'}));assert.throws(()=>sourceClosureHash({}));
});
test('host contract revision/backend and fixture-only authority cannot certify production conditions',()=>{
 const rows=observations();rows[2].identity.backend='manual-popover';rows[3].identity.profileRevision=9;rows[4].identity.authorityMode='EXPLICIT_OFFLINE_C3';
 const r=productCandidateReport({candidate,observations:rows});assert.equal(r.cases[2].blockedBy,'DIFFERENT_HOST_CONTRACT');assert.equal(r.cases[3].blockedBy,'DIFFERENT_HOST_CONTRACT');assert.equal(r.cases[4].blockedBy,'WRONG_OFFLINE_PACKAGE_CONTRACT');
});
test('synthetic reports and another archive never become live Mac evidence',()=>{
 const rows=observations(),live=rows.findIndex(row=>row.journey==='live-home-project-chat');rows[live].evidenceClass='PACKAGED_MV3_SYNTHETIC_HOST';rows[live+1].identity.packageSHA256='2'.repeat(64);
 const r=productCandidateReport({candidate,observations:rows});assert.equal(r.cases[live].blockedBy,'LIVE_CANDIDATE_NOT_VERIFIED');assert.equal(r.cases[live+1].blockedBy,'LIVE_CANDIDATE_NOT_VERIFIED');assert.equal(r.personalDailyCandidate,'NOT_READY');
});
test('old-source failure remains historical and a declared blocker prevents PASS',()=>{
 const rows=observations();rows[0].outcome='FAIL';rows[0].identity.codeSHA='b'.repeat(40);rows[2].blockedBy='UNRESOLVED_CHECK';
 const r=productCandidateReport({candidate,observations:rows});assert.equal(r.cases[0].outcome,'NOT_RUN');assert.equal(r.cases[0].recordedOutcome,'FAIL');assert.equal(r.cases[2].outcome,'PARTIAL');assert.equal(r.cases[2].blockedBy,'UNRESOLVED_CHECK');
});
test('invalid and symbolic browser/viewport metadata do not satisfy a browser receipt',()=>{
 const rows=observations();rows[2].browserVersion='fixture-version';rows[3].viewport={width:0,height:900};rows[4].viewport=[];
 const r=productCandidateReport({candidate,observations:rows});for(const n of [2,3,4])assert.equal(r.cases[n].blockedBy,'INCOMPLETE_BROWSER_PROVENANCE');
});
test('Node adapter requires one complete summary with zero skipped or cancelled cases',()=>{
 const summary=(extra='')=>'ℹ tests 2\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n'+extra;
 assert.equal(interpretProductEvidence('node-contracts',summary()).outcome,'PASS');
 assert.equal(interpretProductEvidence('node-contracts',summary(summary())).outcome,'NOT_RUN');
 assert.equal(interpretProductEvidence('node-contracts',summary().replace('skipped 0','skipped 1')).outcome,'PARTIAL');
 assert.equal(interpretProductEvidence('node-contracts',summary().replace('fail 0','fail 1')).outcome,'FAIL');
});
test('UI10 layout and control subcontract results remain PARTIAL, never product PASS',()=>{
 const raw={status:'PASS_LAYOUT_SUBCONTRACT_ONLY',profiles:[{profile:'MODERN',status:'PASS_LAYOUT_SUBCONTRACT_ONLY'}],interactionMatrix:{status:'PASS_CONTROL_SUBMATRIX_ONLY'}};
 assert.equal(interpretProductEvidence('UI10-MODERN',raw).outcome,'PARTIAL');assert.equal(interpretProductEvidence('UI10-PARTIAL',raw).outcome,'NOT_RUN');
 assert.equal(interpretProductEvidence('UI10-MODERN',{...raw,status:'PASS'}).outcome,'NOT_RUN');
});
test('terminal case success without source/package integrity and actual live check evidence stay NOT_RUN',()=>{
 const raw={status:'PASS_TERMINAL_DELIVERY_MV3',evidence:'PACKAGED_MV3_SYNTHETIC_HOST',cases:[{name:'worker-twice',status:'PASS'}],sourceUnchanged:true,packageUnchanged:true};
 assert.equal(interpretProductEvidence('worker-twice',raw).outcome,'PASS');assert.equal(interpretProductEvidence('worker-twice',{...raw,sourceUnchanged:undefined}).outcome,'NOT_RUN');
 assert.equal(interpretProductEvidence('worker-twice',{...raw,packageUnchanged:false}).outcome,'FAIL');
 assert.equal(interpretProductEvidence('live-home-project-chat',raw).outcome,'NOT_RUN');
});
test('a receipt cannot be created without actual before/after snapshots and command result',()=>{
 assert.throws(()=>createProductRunReceipt({before:{},after:{},reportPath:'unused',command:['node'],exitCode:0}));
});
for(const [journey,kind,count]of [['local-backup-business','BACKUP',6],['local-recovery-business','RECOVERY',7]])test(journey+' requires the current personal MV3 business report, not a legacy or incomplete run',()=>{
 const raw={status:'PASS',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_'+kind,authorityMode:'BROWSER_LOCAL',scopeTupleLength:4,results:Array.from({length:count},(_,i)=>({name:'case_'+i,status:'PASS'})),workerNetworkBlocked:true,cleanupOK:true,guardClosed:true,sourceChangedDuringRun:false,buildManifestUnchanged:true,runnerChangedDuringRun:false};
 assert.equal(interpretProductEvidence(journey,raw).outcome,'PASS');
 for(const patch of [{authorityMode:'EXPLICIT_OFFLINE_C3'},{scopeTupleLength:3},{evidence:'BROWSER_MECHANISM_ONLY'},{results:raw.results.slice(1)},{results:raw.results.map(()=>raw.results[0])},{workerNetworkBlocked:false},{cleanupOK:false},{runnerChangedDuringRun:true}])assert.notEqual(interpretProductEvidence(journey,{...raw,...patch}).outcome,'PASS');
});

test('run receipts bind the complete source/fixture snapshots, report bytes and complete Node selection',()=>{
 const sourceHashes={'src/a.mjs':'1'.repeat(64)},fixtures={'tests/host/a.test.mjs':'2'.repeat(64),'tests/host/b.test.mjs':'3'.repeat(64)},candidate={codeSHA:'a'.repeat(40),sourceHashes},receipt={schema:'vaiwl-product-run-receipt-v1',startedAt:'2026-10-30T01:00:00Z',finishedAt:'2026-10-30T01:01:00Z',codeSHA:candidate.codeSHA,codeSHAAfter:candidate.codeSHA,sourceHashesBefore:sourceHashes,sourceHashesAfter:sourceHashes,fixtureHashesBefore:fixtures,fixtureHashesAfter:fixtures,reportSHA256:'f'.repeat(64),exitCode:0,command:['node','--test',...Object.keys(fixtures)],testFiles:Object.keys(fixtures)},expected={candidate,journey:'node-contracts',evidenceSHA256:receipt.reportSHA256,fixturePaths:Object.keys(fixtures)};
 assert.equal(validateProductRunReceipt(receipt,expected),true);
 assert.throws(()=>validateProductRunReceipt({...receipt,reportSHA256:'0'.repeat(64)},expected),/REPORT_RECEIPT_HASH_MISMATCH/);
 assert.throws(()=>validateProductRunReceipt({...receipt,sourceHashesAfter:{'src/a.mjs':'0'.repeat(64)}},expected),/RUN_SOURCE_CLOSURE_CHANGED/);
 assert.throws(()=>validateProductRunReceipt({...receipt,fixtureHashesAfter:{...fixtures,'tests/host/a.test.mjs':'0'.repeat(64)}},expected),/RUN_FIXTURE_INPUTS_CHANGED/);
 assert.throws(()=>validateProductRunReceipt({...receipt,testFiles:[Object.keys(fixtures)[0]]},expected),/NODE_COMPLETE_SUITE_NOT_RECORDED/);
 assert.throws(()=>validateProductRunReceipt({...receipt,finishedAt:'2026-10-29T01:00:00Z'},expected),/INVALID_RUN_TIME_RECEIPT/);
});
test('a scoped personal UX review must cover every required item and name its separate live exclusions',()=>{
 const identity={journey:'UI10-MODERN',codeSHA:candidate.codeSHA,sourceClosureSHA256:candidate.sourceClosureSHA256,sourceReportSHA256:'9'.repeat(64)},review={schema:'vaiwl-personal-ui10-acceptance-v1',scope:'APPROVED_FREE_PERSONAL_OFFLINE',...identity,status:'PASS',reviewer:'independent-review-fixture',notCovered:['REAL_CHATGPT','PHYSICAL_IME'],checks:PERSONAL_UI10_CHECKS.map(id=>({id,outcome:'PASS',note:'Independent review evidence.',evidence:[{path:'fixture.png',sha256:'8'.repeat(64)}]}))};
 assert.equal(interpretPersonalUXAcceptance(review,identity).outcome,'PASS');
 assert.equal(interpretPersonalUXAcceptance({...review,checks:review.checks.slice(1)},identity).outcome,'PARTIAL');
 assert.equal(interpretPersonalUXAcceptance({...review,sourceReportSHA256:'0'.repeat(64)},identity).outcome,'NOT_RUN');
 assert.equal(interpretPersonalUXAcceptance({...review,notCovered:[]},identity).outcome,'PARTIAL');
 assert.equal(interpretPersonalUXAcceptance({...review,status:'FAIL'},identity).outcome,'FAIL');
});
test('packaged source hashes must refer to actual bytes in the declared Git commit',()=>{
 const codeSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),path='src/host/content-session.mjs',bytes=execFileSync('git',['show',codeSHA+':'+path]),sourceHashes={[path]:createHash('sha256').update(bytes).digest('hex')};
 assert.equal(verifySourceCommit(sourceHashes,codeSHA),true);
 assert.throws(()=>verifySourceCommit({[path]:'0'.repeat(64)},codeSHA),/candidate-source-commit-mismatch/);
 assert.throws(()=>verifySourceCommit({'../outside':'0'.repeat(64)},codeSHA),/invalid-source-path/);
});
