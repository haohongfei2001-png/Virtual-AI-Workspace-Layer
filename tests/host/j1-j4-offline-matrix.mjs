import {partialCheckpoints,assertPartialPaging} from './partial-paging-oracle.mjs';
/** Bounded actual offline journeys. Scoped results never establish full J1-J4/81/G/U acceptance. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),hash=v=>createHash('sha256').update(v).digest('hex');
export const journeyMatrixCases=Object.freeze([
 ...['J1','J2','J3'].flatMap(journey=>['LEGACY','MODERN'].map(profile=>({id:journey.toLowerCase()+'-'+profile.toLowerCase(),journey,profile:journey==='J1'?profile+'_OFFLINE_RECONSTRUCTION_ONLY':profile,script:`tests/host/${journey.toLowerCase()}-package-journey.mjs`,env:{[`FREE_${journey}_PROFILE`]:profile}}))),
 {id:'partial-reachability',journey:'PARTIAL',profile:null,script:'tests/host/partial-package-mv3-browser.mjs',env:{}},
 ...[
  ['before-evidence-reenable','FREE_J4_REPEAT_REENABLE','BEFORE_EVIDENCE_APPLY',null,true],
  ['before-native','FREE_J4_BEFORE_NATIVE_COMMIT','BEFORE_NATIVE_COMMIT',null,false],
  ['after-evidence','FREE_J4_UNPREPARED_AFTER_EVIDENCE','AFTER_EVIDENCE_BEFORE_COMPLETE',null,false],
  ['codec-before-evidence','FREE_J4_CODEC_BEFORE_EVIDENCE','BEFORE_EVIDENCE_APPLY','BEFORE_EVIDENCE',false],
  ['codec-after-evidence','FREE_J4_UNPREPARED_AFTER_EVIDENCE_CODEC','AFTER_EVIDENCE_BEFORE_COMPLETE','AFTER_EVIDENCE',false]
 ].map(([id,flag,boundary,codec,repeat])=>({id:'j4-'+id,journey:'J4',profile:'MODERN_C2_CONVERSATION_GET_OFFLINE',script:'tests/host/j4-package-journey.mjs',env:{[flag]:'1'},boundary,codec,repeat}))
].map(c=>Object.freeze({...c,env:Object.freeze(c.env)})));
export function matrixEnvironment(base,scenario){const env=Object.fromEntries(Object.entries(base).filter(([key])=>!/^FREE_J[1-4]_/.test(key)&&!/^J3_/.test(key)));return {...env,...scenario.env};}
export const j4OptionalPeerRecovery='peer-real-native-navigation-establishes-new-C2-after-worker-memory-loss';
export function j4RequiredCheckpoints(scenario){
 const beforeNative=scenario.boundary==='BEFORE_NATIVE_COMMIT';
 return [
  'two-native-tabs-authenticated-C2-team-context-not-first-roster-entry',
  'native-account-menu-switch-personal-A-retains-team-B-with-distinct-authenticated-contexts',
  'real-backup-preview-and-explicit-import-human-assets-isolated-to-personal-scope',
  'native-send-accepted-authenticated-detail-held-before-evidence',
  'actual-disable-between-native-acceptance-and-evidence-preserves-native-document',
  'new-grant-C4-original-send-recovers-pure-evidence-without-replaying-native-send',
  'second-new-grant-authenticated-read-preserves-single-original-event-and-context-isolation',
  ...(beforeNative?[
   'same-J4-real-worker-stop-aborts-queued-native-Shared-and-continuation-writes',
   'same-J4-new-grant-reobserves-native-title-and-original-strict-event-without-recreating-aborted-ACK',
   'same-J4-aborted-native-reobservation-second-authenticated-read-preserves-original-event-and-peer-isolation'
  ]:[
   'same-J4-native-send-renames-current-C-and-authenticated-ACK-commits-real-joint-pending',
   ...(scenario.codec?['actual-archived-v1-Host-reader-refuses-current-v2-with-original-assets-and-receipts','current-Host-package-restored-same-extension-ID-before-fresh-grant']:[]),
   'same-J4-real-worker-stop-recovers-native-title-and-one-original-ACK-without-send-replay',
   'same-J4-joint-recovery-second-load-is-idempotent-and-peer-context-isolated'
  ]),
  ...(scenario.codec?['codec-peer-explicit-empty-draft-native-context-switch-establishes-fresh-team-context','codec-native-personal-preference-restored-with-fresh-primary-grant']:[]),
  'same-J4-existing-evidence-checksum-fault-real-UI-repair-revokes-activity-and-preserves-draft-assets',
  'same-J4-fresh-authenticated-current-body-history-restores-production-activity-only',
  beforeNative?'same-J4-one-genuine-new-native-send-creates-first-ACK-after-aborted-ACK-and-evidence-repair':'same-J4-one-genuine-new-native-send-creates-successor-ACK-with-old-anchors-still-revoked',
  'same-J4-real-rebind-authenticated-reread-preserves-witness-bytes-origin-budget-and-context-isolation',
  'healthy-production-recovery-inspection-preserves-imported-Pro-assets',
  'explicit-native-root-checksum-fault-and-real-UI-repair-preserve-assets-draft-and-revoke-source',
  'recovered-UNKNOWN-route-retains-identity-and-hides-revoked-titles',
  'actual-target-management-disable-clears-both-tabs-private-projection-and-keeps-original-native-editor',
  'reenable-without-page-refresh-does-not-resurrect-old-private-projection-or-change-assets',
  'reenabled-unrefreshed-peer-keeps-native-document-draft-and-no-private-projection',
  ...(scenario.repeat?Array(2).fill('repeated-actual-disable-reenable-preserves-two-unrefreshed-native-documents'):[]),
  'fresh-native-observation-after-repair-revalidates-current-ref-with-old-sources-still-revoked',
  'fresh-primary-grant-does-not-resurrect-unrefreshed-peer',
  'actual-uninstall-keeps-original-native-document-operable-without-private-projection',
  'subsequent-native-navigation-model-and-editor-operate-after-uninstall'
 ];
}
function assertJ4Checkpoints(scenario,steps){
 const names=steps.map(step=>step.name),optional=names.filter(name=>name===j4OptionalPeerRecovery);
 assert(optional.length<=1,'duplicate optional peer recovery');
 if(optional.length){const index=names.indexOf(j4OptionalPeerRecovery);assert.equal(names[index+1],'same-J4-existing-evidence-checksum-fault-real-UI-repair-revokes-activity-and-preserves-draft-assets','peer recovery must precede evidence repair');}
 assert.deepEqual(names.filter(name=>name!==j4OptionalPeerRecovery),j4RequiredCheckpoints(scenario),'missing, duplicate, unexpected or reordered J4 checkpoint');
 if(scenario.repeat)assert.deepEqual(steps.filter(step=>step.name==='repeated-actual-disable-reenable-preserves-two-unrefreshed-native-documents').map(step=>step.cycle),[1,2]);
}
export const j2RequiredCheckpoints=Object.freeze([
 'old-conversation-authenticated-original-send',
 'native-failed-send-no-anchor',
 'native-success-authenticated-ACK-no-original-time',
 'real-worker-stop-and-new-running-confirmed',
 'expired-calibration-retains-identical-provisional-recent-anchor',
 'later-native-original-time-exact-event-reopen-no-duplicate-or-renewal',
 'other-message-does-not-create-self-activity',
 'old-branch-message-does-not-create-self-activity'
]);
function assertJ2Checkpoints(steps){
 assert(Array.isArray(steps));assert.equal(steps.length,8);
 assert.deepEqual(steps.map(step=>typeof step==='string'?step:step?.name),j2RequiredCheckpoints);
 for(const [index,step] of steps.entries()){
  if(index!==2){assert.equal(typeof step,'string','J2 named checkpoint must retain actual string shape');continue;}
  assert(step&&typeof step==='object'&&!Array.isArray(step),'J2 ACK checkpoint must retain metadata');
  assert(!Object.hasOwn(step,'status')||step.status==='PASS','explicit non-PASS status');
  assert.equal(typeof step.messageId,'string');assert(step.messageId.length>0);
  assert(Number.isFinite(step.latencyMs)&&step.latencyMs>=0);
  assert(step.anchor&&typeof step.anchor==='object'&&!Array.isArray(step.anchor));
  assert.equal(step.anchor.messageId,step.messageId);assert(!Object.hasOwn(step.anchor,'sentAt'),'ACK is not an original-time event');
 }
}
export function admitMatrixReport(scenario,report,exitCode){
 const partial=['J1','J4'].includes(scenario.journey);
 assert.equal(exitCode,partial?2:0,'child must finish with its explicit expected exit');
 assert.equal(report.status,partial?`PARTIAL_${scenario.journey}_NOT_ACCEPTED`:scenario.journey==='J2'?'PASS_OFFLINE_J2_JOURNEY':'PASS');
 if(scenario.profile!==null)assert.equal(report.profile,scenario.profile);assert.equal(report.realChatGPT,'NOT_RUN');
 assert.deepEqual(report.errors,[]);assert.equal(report.sourceChangedDuringRun,false);if(scenario.journey!=='J2')assert.equal(report.buildManifestUnchanged,true);
 assert(!report.cleanupErrors?.length&&!report.finalizationErrors?.length,'cleanup failure');
 assert(report.sourceHashes&&Object.keys(report.sourceHashes).length>0,'missing exact product hashes');
 const steps=scenario.journey==='PARTIAL'?report.results:report.steps;if(scenario.journey==='J2')assertJ2Checkpoints(steps);else assert(steps?.length>0&&steps.every(step=>step.status==='PASS'),'missing continuous steps');
 if(scenario.journey==='J1'){
  assert.equal(report.evidence,'SINGLE_CONTINUOUS_REAL_HEADLESS_PACKAGED_MV3_OFFLINE_JOURNEY');assert.equal(report.steps.length,9);
  assert.equal(report.scriptChangedDuringRun,false);assert.equal(report.fixtureChangedDuringRun,false);
 }else if(scenario.journey==='J2'){
  assert.equal(report.evidence,'OFFLINE_PACKAGED_MV3_REAL_WALL_CLOCK');assert.equal(report.steps.length,8);assert(!report.diagnosticErrors?.length);assert.equal(report.releaseStatus,'NOT_RELEASE_READY');
 }else if(scenario.journey==='J3'){
  assert.equal(report.evidence,'SINGLE_CONTINUOUS_REAL_HEADLESS_PACKAGED_MV3_OFFLINE_JOURNEY');assert.equal(report.steps.length,16);assert.equal(report.fixtureChangedDuringRun,false);assert.equal(report.scriptChangedDuringRun,false);assert.equal(report.ui06HelperChangedDuringRun,false);assert.equal(report.physicalIME,'NOT_RUN');
 }else if(scenario.journey==='PARTIAL'){
  assert.equal(report.evidence,'REAL_HEADLESS_PACKAGED_MV3_PARTIAL_RECONSTRUCTION');assert.deepEqual(report.results.map(r=>r.name),partialCheckpoints);assertPartialPaging(report.paging);assert.equal(report.workerExternalNetwork,'BLOCKED');assert.equal(report.fixtureChangedDuringRun,false);assert.equal(report.scriptChangedDuringRun,false);assert.equal(report.release,'NOT_RELEASE_READY');
 }else{
  assert.equal(report.evidence,'S_CONTINUOUS_REAL_PACKAGED_MV3_J4_SEGMENT');assert.equal(report.release,'NOT_RELEASE_READY');
  assert.equal(report.jointInterruptionBoundary,scenario.boundary);assert.equal(report.codecScenario,scenario.codec);assertJ4Checkpoints(scenario,report.steps);
  if(scenario.repeat){assert.equal(report.repeatedReenable?.length,2);assert.deepEqual(report.repeatedReenable.map(value=>value.cycle),[1,2]);assert.equal(report.steps.filter(step=>step.name==='repeated-actual-disable-reenable-preserves-two-unrefreshed-native-documents').length,2);}
 }
 return {id:scenario.id,status:'PASS_SCOPED_CONTINUOUS_CASE',steps:steps.length,sourceHashes:report.sourceHashes};
}
export function summarizeJourneyMatrix(rows,{selected=journeyMatrixCases.map(c=>c.id)}={}){
 assert.equal(new Set(selected).size,selected.length);assert(selected.every(id=>journeyMatrixCases.some(c=>c.id===id)));
 const sameSet=rows.length===selected.length&&new Set(rows.map(r=>r.id)).size===rows.length&&selected.every(id=>rows.some(r=>r.id===id));
 const hashes=rows.filter(r=>r.status==='PASS_SCOPED_CONTINUOUS_CASE').map(r=>JSON.stringify(Object.entries(r.sourceHashes).sort(([a],[b])=>a.localeCompare(b))));
 const consistent=hashes.length>0&&new Set(hashes).size===1;
 return {status:sameSet&&consistent&&rows.every(r=>r.status==='PASS_SCOPED_CONTINUOUS_CASE')?'PASS_SCOPED_OFFLINE_MATRIX':'INCOMPLETE_OR_FAILED',selected,sourceConsistent:consistent,fullPlannedMatrix:selected.length===journeyMatrixCases.length,fullJ1:'NOT_ESTABLISHED',fullJ2:'NOT_ESTABLISHED',fullJ3:'NOT_ESTABLISHED',fullJ4:'NOT_ESTABLISHED',full81:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',rows,limitations:['LEGACY/MODERN J1-J3 and MODERN C2 J4 are represented. PARTIAL is only a bounded five-step paging/reachability slice, never full J1-J4 acceptance.','Each row is one actually executed continuous journey; rows do not combine into a fictional cross-profile execution.','Unobservable account switching, real source semantics, physical IME/PAIA and other G/U acceptance remain separate.','Declared interruption/codec/lifecycle combinations only; no exhaustive cross-product or stress claim.']};
}
async function execute(scenario,directory){
 const reportPath=join(directory,scenario.id+'.json'),logPath=join(directory,scenario.id+'.log'),log=await open(logPath,'w');let timer,killer;
 try{
  const result=await new Promise(resolveResult=>{
   const child=spawn(process.execPath,[scenario.script,reportPath],{cwd:root,env:matrixEnvironment(process.env,scenario),stdio:['ignore',log.fd,log.fd],detached:process.platform!=='win32'});let timedOut=false;
   const kill=signal=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
   timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');killer=setTimeout(()=>kill('SIGKILL'),5000);},480000);
   child.once('error',error=>resolveResult({error:String(error),code:null}));child.once('close',(code,signal)=>resolveResult({code,signal,timedOut}));
  });
  if(result.error||result.timedOut)throw Error(result.error??'journey-child-timeout');
  const bytes=await readFile(reportPath),report=JSON.parse(bytes);return {...admitMatrixReport(scenario,report,result.code),reportPath,reportSha256:hash(bytes),logPath};
 }catch(error){return {id:scenario.id,status:'FAIL_OR_NOT_RUN',error:String(error),reportPath,logPath};}
 finally{clearTimeout(timer);clearTimeout(killer);await log.close();}
}
export async function runJourneyMatrix(directory,{executeBrowser=false,selected=journeyMatrixCases.map(c=>c.id)}={}){
 summarizeJourneyMatrix([],{selected});await mkdir(directory,{recursive:true});
 if(!executeBrowser){const plan={status:'NOT_RUN',cases:journeyMatrixCases.filter(c=>selected.includes(c.id)),realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY'};await writeFile(join(directory,'matrix.json'),JSON.stringify(plan,null,2)+'\n');return plan;}
 const rows=[];for(const id of selected){rows.push(await execute(journeyMatrixCases.find(c=>c.id===id),directory));if(rows.at(-1).status!=='PASS_SCOPED_CONTINUOUS_CASE')break;}
 const report=summarizeJourneyMatrix(rows,{selected});await writeFile(join(directory,'matrix.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const selectedArg=process.argv.find(arg=>arg.startsWith('--cases=')),selected=selectedArg?selectedArg.slice(8).split(','):undefined;
 const report=await runJourneyMatrix(resolve(process.argv[2]??'/tmp/vaiwl-j1-j4-matrix'),{executeBrowser:process.argv.includes('--execute-browser'),...(selected?{selected}:{})});console.log(JSON.stringify(report));if(!['NOT_RUN','PASS_SCOPED_OFFLINE_MATRIX'].includes(report.status))process.exitCode=1;
}
