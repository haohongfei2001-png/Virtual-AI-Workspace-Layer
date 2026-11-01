/** Read-only collector for explicit run receipts. It never launches a test or reads a user browser profile.
 * node tests/host/product-candidate-gate.mjs --manifest INPUT.json --output NEW-REPORT.json
 * Input paths are relative to INPUT.json; receipt/package paths are relative to their containing JSON.
 * schema: vaiwl-product-candidate-input-v1
 * { candidate:{unpacked,archive,codeSHA,profileRevision?}, evidence:[{journey,report,receipt,personalUXAcceptance?}], blockedBy:[] }
 * Receipt schema: vaiwl-product-run-receipt-v1, created by createProductRunReceipt below around an actual
 * runner invocation. Do not manufacture historical before/after snapshots from the current checkout.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PRODUCT_CASES,candidatePackageIdentity,productCandidateReport,sourceClosureHash,verifySourceCommit} from './product-candidate-report.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const equalMap=(a,b)=>sourceClosureHash(a)===sourceClosureHash(b);
const knownCases=new Map(PRODUCT_CASES.map(row=>[row.journey,row.level]));
export const PERSONAL_UI10_CHECKS=Object.freeze(['workspace-sidebar-layout','navigation-search-working-set-snippet-controls','native-composer-model-tools-attachments','focus-hit-targets','responsive-long-titles-light-dark','visual-v27-comparison']);
const terminalCases=new Set(['native-root-replacement','worker-twice','cosmetic-native-island','native-island-evolution','extension-disable']);
const pathAt=(base,path)=>typeof path==='string'&&path?isAbsolute(path)?path:resolve(base,path):null;
const trackedTests=(codeSHA,repositoryRoot)=>execFileSync('git',['ls-tree','-r','--name-only',codeSHA,'--','tests'],{cwd:repositoryRoot,encoding:'utf8'}).trim().split('\n').filter(path=>path&&/\.(?:mjs|js|json|html|css|ts)$/.test(path));

/** Caller takes this immediately before and after an authorized existing runner; no test is started here. */
export function snapshotProductInputs({candidate,repositoryRoot=root}){
 const codeSHA=execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim();
 const readHashes=paths=>Object.fromEntries(paths.map(path=>[path,hash(readFileSync(resolve(repositoryRoot,path)))]));
 return {schema:'vaiwl-product-run-snapshot-v1',capturedAt:new Date().toISOString(),codeSHA,
  sourceHashes:readHashes(Object.keys(candidate.sourceHashes)),fixtureHashes:readHashes(trackedTests(candidate.codeSHA,repositoryRoot))};
}

/** Bind one completed run's actual result bytes to its before/after inputs; callers save this JSON once. */
export function createProductRunReceipt({before,after,reportPath,command,exitCode,testFiles,browserVersion,viewport,package:built}){
 if(before?.schema!=='vaiwl-product-run-snapshot-v1'||after?.schema!=='vaiwl-product-run-snapshot-v1'||!Array.isArray(command)||!command.length||!Number.isInteger(exitCode))throw Error('invalid-run-receipt-arguments');
 return {schema:'vaiwl-product-run-receipt-v1',startedAt:before.capturedAt,finishedAt:after.capturedAt,codeSHA:before.codeSHA,codeSHAAfter:after.codeSHA,
  sourceHashesBefore:before.sourceHashes,sourceHashesAfter:after.sourceHashes,fixtureHashesBefore:before.fixtureHashes,fixtureHashesAfter:after.fixtureHashes,
  reportSHA256:hash(readFileSync(reportPath)),command,exitCode,...(testFiles?{testFiles}:{}),...(browserVersion?{browserVersion}:{}),...(viewport?{viewport}:{}),...(built?{package:built}:{})};
}

function nodeSummary(text){
 const value=String(text).replace(/\x1b\[[0-9;]*m/g,''),result={};
 for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...value.matchAll(new RegExp('(?:^|\\n)(?:#|ℹ)?\\s*'+key+'\\s+(\\d+)\\s*(?=\\r?\\n|$)','g'))];if(matches.length!==1)return null;result[key]=Number(matches[0][1]);}
 return result;
}
const partial=blockedBy=>({outcome:'PARTIAL',blockedBy});
const absent=blockedBy=>({outcome:'NOT_RUN',blockedBy});
const failed=blockedBy=>({outcome:'FAIL',blockedBy});
const passed=()=>({outcome:'PASS',blockedBy:null});

/** Strict adapters for existing runners' public reports, not a second implementation of their assertions. */
export function interpretProductEvidence(journey,report,receipt={}){
 if(!knownCases.has(journey))throw Error('unknown-product-journey');
 if(journey==='node-contracts'){
  const counts=nodeSummary(report);if(!counts)return absent('NODE_SUMMARY_MISSING_OR_AMBIGUOUS');
  if(counts.fail||counts.cancelled)return failed('NODE_TEST_FAILURE');
  if(!counts.tests||counts.pass!==counts.tests||counts.skipped||counts.todo)return partial('NODE_SUITE_INCOMPLETE');
  return passed();
 }
 if(!report||typeof report!=='object'||Array.isArray(report))return absent('REPORT_OBJECT_REQUIRED');
 if(report.sourceUnchanged===false||report.sourceChangedDuringRun===true||report.packageUnchanged===false||report.buildManifestUnchanged===false||report.testSourcesStable===false)return failed('RUN_INPUTS_CHANGED');
 if((report.cleanupErrors?.length??0)||(report.lifecycleErrors?.length??0)||report.cleanupError)return failed('RUN_CLEANUP_FAILED');
 if(/^FAIL|^ERROR/.test(report.status??''))return failed('SOURCE_REPORT_FAILED');
 if(journey==='flow-boundaries')return report.status==='PASS_BOUNDARY_MECHANISMS'&&report.evidence==='BROWSER_MECHANISM_ONLY'&&Array.isArray(report.checks)&&report.checks.length>0&&report.checks.every(row=>row.ok===true)?passed():absent('BOUNDARY_REPORT_NOT_PASS');
 if(journey==='native-region-evolution')return report.status==='PASS_LAYOUT_BOUNDARY_MV3'&&report.evidence==='PACKAGED_MV3_SYNTHETIC_HOST'&&Array.isArray(report.checks)&&report.checks.length===6&&report.checks.every(row=>row.visible===true&&row.sameFrame===true&&row.joins===1)?passed():absent('REGION_EVOLUTION_REPORT_NOT_PASS');
 if(terminalCases.has(journey)){
  const cases=report.cases?.filter(row=>row.name===journey)??[];if(cases.length!==1)return absent('TERMINAL_CASE_MISSING_OR_AMBIGUOUS');
  if(cases[0].status!=='PASS')return failed('TERMINAL_CASE_FAILED');
  return report.status==='PASS_TERMINAL_DELIVERY_MV3'&&report.evidence==='PACKAGED_MV3_SYNTHETIC_HOST'&&report.sourceUnchanged===true&&report.packageUnchanged===true?passed():absent('TERMINAL_SUITE_INCOMPLETE');
 }
 if(journey==='continuous-browser-local'){
  if(!receipt.command?.includes('--flow-only'))return absent('CONTINUOUS_FLOW_ONLY_COMMAND_NOT_RECORDED');
  const required=['workerRecoveryKeepsPersonalAndUserExpansion','newDocumentLocksAndConfirmedPrivateObjectAndLayoutRestore','privateScopeRevokeClearsPriorProject','actualIsolatedUninstallRestoresNativeGeometryDraftAndInput','actualIsolatedUninstallRestoresNativeReadingPosition'];
  return report.status==='PASS'&&report.evidence==='ISOLATED_MV3_FORMAL_UI_LOCAL_SESSION_AND_PERSONAL'&&required.every(key=>report.checks?.[key]===true)?passed():absent('CONTINUOUS_FLOW_CHECKS_INCOMPLETE');
 }
 if(journey.startsWith('UI10-')){
  const profile=journey.slice(5),rows=report.profiles?.filter(row=>row.profile===profile)??[];
  if(!rows.length)return absent('UI10_PROFILE_NOT_EXECUTED');
  if(rows.some(row=>row.status==='FAIL'||row.error||row.sourceChangedDuringRun===true||row.buildManifestUnchanged===false))return failed('UI10_PROFILE_FAILED');
  // This runner explicitly excludes full v2.7, populated assets and physical input. Its PASS is a subcontract.
  if(report.status==='PASS_LAYOUT_SUBCONTRACT_ONLY'&&rows.every(row=>row.status==='PASS_LAYOUT_SUBCONTRACT_ONLY'))return partial('UI10_LAYOUT_SUBCONTRACT_ONLY_NOT_PRODUCT_ACCEPTANCE');
  return absent('UI10_FULL_PRODUCT_ACCEPTANCE_NOT_ESTABLISHED');
 }
 if(journey==='existing-snippet-business')return report.status==='PASS'&&report.evidence==='REAL_HEADLESS_PACKAGED_MV3_OFFLINE_SNIPPETS'&&Array.isArray(report.results)&&report.results.length===6&&report.results.every(row=>row.status==='PASS')&&report.sourceChangedDuringRun===false&&report.buildManifestUnchanged===true?passed():absent('EXISTING_SNIPPET_BUSINESS_INCOMPLETE');
 if(['local-backup-business','local-recovery-business'].includes(journey)){
  const backup=journey==='local-backup-business',rows=report.results;
  return report.status==='PASS'&&report.evidence===('REAL_HEADLESS_PACKAGED_MV3_OFFLINE_'+(backup?'BACKUP':'RECOVERY'))&&report.authorityMode==='BROWSER_LOCAL'&&report.scopeTupleLength===4&&Array.isArray(rows)&&rows.length===(backup?6:7)&&rows.every(row=>typeof row.name==='string'&&row.name.length>0&&row.status==='PASS')&&new Set(rows.map(row=>row.name)).size===rows.length&&report.workerNetworkBlocked===true&&report.cleanupOK===true&&report.guardClosed===true&&report.sourceChangedDuringRun===false&&report.buildManifestUnchanged===true&&report.runnerChangedDuringRun===false?passed():absent('LOCAL_ASSET_BUSINESS_INCOMPLETE');
 }
 if(journey==='local-existing-snippet-business'){
  const local=report.existingLocalSnippets;
  return interpretProductEvidence('local-backup-business',report,receipt).outcome==='PASS'&&local?.status==='PASS'&&local.scopeTupleLength===4&&local.previewReadOnly===true&&local.nativeSelectionAvailable===false&&JSON.stringify(local.nativeActionsRejected)===JSON.stringify([{action:'save',ok:false},{action:'locate',ok:false}])&&local.explicitRemoveOnly===true&&local.otherManualAssetsUnchanged===true&&local.nativeDraftAndSelectionUnchanged===true?passed():absent('LOCAL_EXISTING_SNIPPET_BUSINESS_INCOMPLETE');
 }
 if(journey==='historical-upgrade-assets')return report.status==='PASS_ACTUAL_OLD_HOST_SCHEMA3_UPGRADE_ASSETS_AND_OLD_OWNER_FENCE'&&report.evidence==='S_REAL_OLD_HOST_TO_CURRENT_HOST_SAME_EXTENSION_ID'&&report.compatibility==='ACTUAL_OLD_HOST_SCHEMA_3_TO_CURRENT_NOT_SCHEMA_2'&&report.sourceUnchanged===true&&Array.isArray(report.steps)&&report.steps.length>=5&&report.steps.every(row=>row.status==='PASS')?passed():absent('HISTORICAL_SCHEMA3_ASSET_JOURNEY_INCOMPLETE');
 if(knownCases.get(journey)==='L3'){
  if(report.schema!=='vaiwl-live-product-case-v1'||report.journey!==journey||report.evidence!=='LIVE_AUTHORIZED_CHATGPT'||report.realChatGPT!=='LIVE_VERIFIED')return absent('LIVE_EVIDENCE_NOT_EXECUTED');
  return report.status==='PASS'&&Array.isArray(report.checks)&&report.checks.length>0&&report.checks.every(row=>row.ok===true)?passed():absent('LIVE_CHECKS_INCOMPLETE');
 }
 return absent('UNSUPPORTED_REPORT');
}

/** A separate current-scope review may pass without rewriting the older full-UI10 subcontract result. */
export function interpretPersonalUXAcceptance(review,{journey,codeSHA,sourceClosureSHA256,sourceReportSHA256}){
 if(review?.schema!=='vaiwl-personal-ui10-acceptance-v1'||review.scope!=='APPROVED_FREE_PERSONAL_OFFLINE'||review.journey!==journey||review.codeSHA!==codeSHA||review.sourceClosureSHA256!==sourceClosureSHA256||review.sourceReportSHA256!==sourceReportSHA256)return absent('PERSONAL_UX_REVIEW_IDENTITY_MISMATCH');
 if(review.status==='FAIL'||review.checks?.some(check=>check.outcome==='FAIL'))return failed('PERSONAL_UX_REVIEW_FAILED');
 if(review.status!=='PASS'||!Array.isArray(review.checks)||review.checks.length!==PERSONAL_UI10_CHECKS.length||new Set(review.checks.map(check=>check.id)).size!==PERSONAL_UI10_CHECKS.length||!PERSONAL_UI10_CHECKS.every(id=>review.checks.some(check=>check.id===id&&check.outcome==='PASS'&&typeof check.note==='string'&&check.note.trim()&&Array.isArray(check.evidence)&&check.evidence.length)))return partial('PERSONAL_UX_REVIEW_INCOMPLETE');
 if(typeof review.reviewer!=='string'||!review.reviewer.trim()||!Array.isArray(review.notCovered)||!['REAL_CHATGPT','PHYSICAL_IME'].every(id=>review.notCovered.includes(id)))return partial('PERSONAL_UX_REVIEW_SCOPE_UNCLEAR');
 return passed();
}

function personalUXReview(path,observation,candidate){
 const bytes=readFileSync(path),review=JSON.parse(bytes),result=interpretPersonalUXAcceptance(review,{journey:observation.journey,codeSHA:candidate.codeSHA,sourceClosureSHA256:candidate.sourceClosureSHA256,sourceReportSHA256:observation.evidenceSHA256});
 if(result.outcome==='PASS')for(const check of review.checks){for(const evidence of check.evidence){if(typeof evidence.path!=='string'||typeof evidence.sha256!=='string'||hash(readFileSync(pathAt(dirname(path),evidence.path)))!==evidence.sha256)throw Error('PERSONAL_UX_REVIEW_EVIDENCE_CHANGED');}if(check.id==='visual-v27-comparison'&&!check.evidence.some(evidence=>readFileSync(pathAt(dirname(path),evidence.path)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw Error('PERSONAL_UX_REVIEW_SCREENSHOT_MISSING');}
 return {...result,personalUXAcceptance:{path,sha256:hash(bytes),scope:review.scope,reviewer:review.reviewer,checks:review.checks,notCovered:review.notCovered}};
}

function expectedRunner(journey){
 if(journey==='node-contracts')return null;
 if(journey==='flow-boundaries')return 'tests/host/document-flow-boundary-browser.mjs';
 if(journey==='native-region-evolution')return 'tests/host/document-flow-boundary-mv3.mjs';
 if(terminalCases.has(journey))return 'tests/host/terminal-delivery-mv3.mjs';
 if(journey==='continuous-browser-local')return 'tests/host/browser-local-mv3.mjs';
 if(journey.startsWith('UI10-'))return 'tests/host/ui10-package-matrix-browser.mjs';
 if(journey==='existing-snippet-business')return 'tests/host/snippets-package-mv3-browser.mjs';
 if(['local-backup-business','local-existing-snippet-business'].includes(journey))return 'tests/host/backup-package-mv3-browser.mjs';
 if(journey==='local-recovery-business')return 'tests/host/recovery-package-mv3-browser.mjs';
 if(journey==='historical-upgrade-assets')return 'tests/host/historical-host-upgrade.mjs';
 return null;
}
function packagesFrom(journey,report,receipt,reportDirectory,receiptDirectory){
 if(journey.startsWith('UI10-'))return (report.profiles??[]).filter(row=>row.profile===journey.slice(5)).map(row=>({built:row.package,base:reportDirectory}));
 const built=report.package??report.build??report.currentPackage;return built?[{built,base:reportDirectory}]:receipt.package?[{built:receipt.package,base:receiptDirectory}]:[];
}
function browserProvenance(journey,report,receipt){
 const profiles=journey.startsWith('UI10-')?(report.profiles??[]).filter(row=>row.profile===journey.slice(5)):[];
 const versions=[report.browserVersion,report.browser,...profiles.map(row=>row.browserVersion),receipt.browserVersion].filter(value=>typeof value==='string');
 if(new Set(versions).size>1)throw Error('BROWSER_VERSION_CONFLICT');
 const viewports=report.viewports??report.viewport??receipt.viewport??profiles.flatMap(row=>row.viewports??(row.steps??[]).map(step=>step.cell?.viewport??step.viewport).filter(Boolean));
 return {browserVersion:versions[0]??null,viewport:Array.isArray(viewports)&&!viewports.length?null:viewports??null};
}

export function validateProductRunReceipt(receipt,{candidate,journey,evidenceSHA256,fixturePaths,repositoryRoot=root}){
  if(receipt.schema!=='vaiwl-product-run-receipt-v1'||!Number.isInteger(receipt.exitCode)||!Array.isArray(receipt.command)||!receipt.command.length)throw Error('INVALID_RUN_RECEIPT');
  if(!Number.isFinite(Date.parse(receipt.startedAt))||!Number.isFinite(Date.parse(receipt.finishedAt))||Date.parse(receipt.startedAt)>Date.parse(receipt.finishedAt))throw Error('INVALID_RUN_TIME_RECEIPT');
  if(receipt.reportSHA256!==evidenceSHA256)throw Error('REPORT_RECEIPT_HASH_MISMATCH');
  if(receipt.codeSHA!==candidate.codeSHA||receipt.codeSHAAfter!==candidate.codeSHA)throw Error('DIFFERENT_SOURCE_CANDIDATE');
  if(!equalMap(receipt.sourceHashesBefore,candidate.sourceHashes)||!equalMap(receipt.sourceHashesAfter,candidate.sourceHashes))throw Error('RUN_SOURCE_CLOSURE_CHANGED');
  if(!equalMap(receipt.fixtureHashesBefore,receipt.fixtureHashesAfter))throw Error('RUN_FIXTURE_INPUTS_CHANGED');
  if(JSON.stringify(Object.keys(receipt.fixtureHashesBefore).sort())!==JSON.stringify(fixturePaths.sort()))throw Error('INCOMPLETE_FIXTURE_CLOSURE');
  const runner=expectedRunner(journey);
  if(runner&&(!receipt.command.some(arg=>arg===runner||arg===resolve(repositoryRoot,runner))||!receipt.fixtureHashesBefore[runner]))throw Error('RUNNER_RECEIPT_MISMATCH');
  if(journey==='node-contracts'){
   const expected=fixturePaths.filter(path=>path.endsWith('.test.mjs')).sort();
   if(!receipt.command.includes('--test')||!Array.isArray(receipt.testFiles)||JSON.stringify([...receipt.testFiles].sort())!==JSON.stringify(expected)||!expected.every(path=>receipt.command.includes(path)||receipt.command.includes(resolve(repositoryRoot,path))))throw Error('NODE_COMPLETE_SUITE_NOT_RECORDED');
  }
 return true;
}

function collectOne(entry,base,candidate,repositoryRoot){
 const evidencePath=pathAt(base,entry.report),receiptPath=pathAt(base,entry.receipt),identity={codeSHA:candidate.codeSHA,sourceClosureSHA256:candidate.sourceClosureSHA256,backend:candidate.backend,profileRevision:candidate.profileRevision};
 const observation={journey:entry.journey,identity,outcome:'NOT_RUN',blockedBy:'NOT_EXECUTED',evidencePath,receiptPath};
 try{
  if(!evidencePath||!receiptPath)throw Error('REPORT_OR_RECEIPT_NOT_SUPPLIED');
  const bytes=readFileSync(evidencePath),receipt=json(receiptPath),report=entry.journey==='node-contracts'?bytes.toString('utf8'):JSON.parse(bytes);
  observation.evidenceSHA256=hash(bytes);observation.evidenceStatus=report?.status??null;
  const fixturePaths=trackedTests(candidate.codeSHA,repositoryRoot);
  validateProductRunReceipt(receipt,{candidate,journey:entry.journey,evidenceSHA256:observation.evidenceSHA256,fixturePaths,repositoryRoot});
  verifySourceCommit(receipt.fixtureHashesBefore,candidate.codeSHA,repositoryRoot);
  Object.assign(observation,interpretProductEvidence(entry.journey,report,receipt),{exitCode:receipt.exitCode,fixtureSetSHA256:sourceClosureHash(receipt.fixtureHashesBefore)});
  observation.sourceOutcome=observation.outcome;
  if(entry.journey==='node-contracts'){observation.evidenceClass='NODE_CONTRACTS';return observation;}
  Object.assign(observation,browserProvenance(entry.journey,report,receipt));
  if(entry.journey==='flow-boundaries'){observation.evidenceClass='BROWSER_MECHANISM_ONLY';return observation;}
  const supplied=packagesFrom(entry.journey,report,receipt,dirname(evidencePath),dirname(receiptPath));
  if(!supplied.length||supplied.some(row=>!row.built?.unpacked||!row.built?.archive))throw Error('ACTUAL_PACKAGE_PATHS_MISSING');
  const packages=supplied.map(({built,base})=>candidatePackageIdentity({unpacked:pathAt(base,built.unpacked),archive:pathAt(base,built.archive),codeSHA:candidate.codeSHA,profileRevision:candidate.profileRevision,repositoryRoot}));
  if(packages.some(info=>info.sourceClosureSHA256!==candidate.sourceClosureSHA256))throw Error('DIFFERENT_PACKAGE_SOURCE_CANDIDATE');
  if(new Set(packages.map(info=>[info.backend,info.authorityMode,info.profileRevision].join(':'))).size!==1)throw Error('MULTI_PACKAGE_CONTRACT_CONFLICT');
  observation.identity=packages[0];observation.packages=packages.map(({sourceHashes,...info})=>info);
  observation.evidenceClass=knownCases.get(entry.journey)==='L3'?'LIVE_AUTHORIZED_CHATGPT':'PACKAGED_MV3_SYNTHETIC_HOST';
  if(entry.journey.startsWith('UI10-')&&observation.outcome==='PARTIAL'&&entry.personalUXAcceptance){
   if(report.interactionMatrix?.status!=='PASS_CONTROL_SUBMATRIX_ONLY'||report.interactionMatrix.coverageComplete!==true)observation.blockedBy='CURRENT_PERSONAL_UX_CONTROL_SUBMATRIX_INCOMPLETE';
   else Object.assign(observation,personalUXReview(pathAt(base,entry.personalUXAcceptance),observation,candidate));
  }
  return observation;
 }catch(error){return {...observation,outcome:'NOT_RUN',blockedBy:error.code==='ENOENT'?'EVIDENCE_FILE_MISSING':error.message};}
}

export function collectProductCandidate(manifestPath,{repositoryRoot=root}={}){
 const path=resolve(manifestPath),base=dirname(path),input=json(path);
 if(input.schema!=='vaiwl-product-candidate-input-v1'||!input.candidate||!Array.isArray(input.evidence))throw Error('invalid-product-input-manifest');
 if(input.evidence.some(entry=>!entry||!knownCases.has(entry.journey))||new Set(input.evidence.map(entry=>entry.journey)).size!==input.evidence.length)throw Error('duplicate-or-unknown-manifest-journey');
 const candidate=candidatePackageIdentity({...input.candidate,unpacked:pathAt(base,input.candidate.unpacked),archive:pathAt(base,input.candidate.archive),repositoryRoot});
 if(candidate.packageKind!=='HOST_IMPLEMENTATION_UNVERIFIED'||candidate.origin!=='https://chatgpt.com'||candidate.authorityMode!=='BROWSER_LOCAL')throw Error('formal-browser-local-candidate-required');
 const observations=input.evidence.map(entry=>collectOne(entry,base,candidate,repositoryRoot));
 return {...productCandidateReport({candidate,observations,blockedBy:input.blockedBy??[]}),collector:{schema:'vaiwl-product-candidate-collector-v1',input:path,mode:'COLLECT_ONLY',testExecution:'NOT_REQUESTED'}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help')console.log('Usage: node tests/host/product-candidate-gate.mjs --manifest INPUT.json --output NEW-REPORT.json\nReads explicit run receipts only. It does not execute tests or access a user profile. See this file header for the manifest schema and exported snapshot/receipt helpers. Missing evidence remains NOT_RUN. Existing output files are never overwritten.');
  else{
   if(args.length!==4||args[0]!=='--manifest'||args[2]!=='--output')throw Error('expected --manifest INPUT.json --output NEW-REPORT.json; --execute is not implemented');
   const result=collectProductCandidate(args[1]),output=resolve(args[3]);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({output,levels:result.levels,personalDailyCandidate:result.personalDailyCandidate,fullFree:result.fullFree,publicRelease:result.publicRelease}));
   if(result.fullFree!=='ACCEPTED')process.exitCode=2;
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
