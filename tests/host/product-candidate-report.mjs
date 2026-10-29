import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyHost} from '../../extension/package.mjs';
import {zip} from '../../simulator/package.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sha1=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
export const sourceClosureHash=sources=>{
 if(!plain(sources)||!Object.keys(sources).length||Object.values(sources).some(value=>!sha256(value)))throw Error('invalid-source-hashes');
 return hash(JSON.stringify(Object.entries(sources).sort(([a],[b])=>a<b?-1:a>b?1:0)));
};
export const PRODUCT_CASES=Object.freeze([
 ['node-contracts','L1'],['flow-boundaries','L1'],
 ['native-region-evolution','L2'],['native-root-replacement','L2'],
 ['worker-twice','L2'],['cosmetic-native-island','L2'],['native-island-evolution','L2'],['extension-disable','L2'],
 ['continuous-browser-local','L2'],['UI10-LEGACY','L2'],['UI10-MODERN','L2'],['UI10-PARTIAL','L2'],
 ['existing-snippet-business','L2'],['historical-upgrade-assets','L2'],
 ['live-home-project-chat','L3'],['live-existing-assets','L3'],['live-navigation-search-return','L3'],
 ['live-physical-ime-tools','L3'],['live-responsive-themes','L3'],['live-document-lock-restore','L3'],['live-disable-native-restore','L3'],
].map(([journey,level])=>Object.freeze({journey,level})));
const offlineAuthorities=new Map([
 ['UI10-LEGACY','EXPLICIT_OFFLINE_C3'],['UI10-MODERN','EXPLICIT_OFFLINE_C2_CONVERSATION'],['UI10-PARTIAL','EXPLICIT_OFFLINE_C3'],
 ['existing-snippet-business','EXPLICIT_OFFLINE_C3'],['historical-upgrade-assets','EXPLICIT_OFFLINE_C3'],
]);
const validViewport=value=>plain(value)&&Number.isSafeInteger(value.width)&&value.width>0&&Number.isSafeInteger(value.height)&&value.height>0;
function validIdentity(value){return plain(value)&&sha1(value.codeSHA)&&sha256(value.sourceClosureSHA256)&&sha256(value.contentFingerprint)&&sha256(value.packageSHA256)&&value.backend==='document-flow'&&typeof value.authorityMode==='string'&&!!value.authorityMode&&Number.isSafeInteger(value.profileRevision)&&value.profileRevision>0;}

/** Bind packaged source bytes to the claimed Git object, including a dirty worktree refusal at freeze time. */
export function verifySourceCommit(sourceHashes,codeSHA,repositoryRoot=resolve(fileURLToPath(new URL('../..',import.meta.url)))){
 sourceClosureHash(sourceHashes);if(!sha1(codeSHA))throw Error('invalid-candidate-code-sha');
 const paths=Object.keys(sourceHashes).sort();
 if(paths.some(path=>!path||path.startsWith('/')||path.split('/').includes('..')||/[\\\n\r\0]/.test(path)))throw Error('invalid-source-path');
 const data=execFileSync('git',['cat-file','--batch'],{cwd:repositoryRoot,input:paths.map(path=>codeSHA+':'+path).join('\n')+'\n',maxBuffer:128*1024*1024});
 let offset=0;
 for(const path of paths){const end=data.indexOf(10,offset),header=data.subarray(offset,end).toString('utf8'),match=/^[a-f0-9]{40} blob (\d+)$/.exec(header);if(!match)throw Error('candidate-source-not-in-commit:'+path);const size=Number(match[1]),start=end+1;offset=start+size+1;if(hash(data.subarray(start,start+size))!==sourceHashes[path])throw Error('candidate-source-commit-mismatch:'+path);}
 if(offset!==data.length)throw Error('invalid-source-commit-batch');
 return true;
}

/** Read both package identities from bytes. The deterministic archive must match this verified unpacked package. */
export function candidatePackageIdentity({unpacked,archive,codeSHA,profileRevision,repositoryRoot}){
 verifyHost(unpacked);
 const manifestBytes=readFileSync(join(unpacked,'build-manifest.json')),info=JSON.parse(manifestBytes);
 verifySourceCommit(info.sourceHashes,codeSHA,repositoryRoot);
 const content=readFileSync(join(unpacked,'content.js'),'utf8');
 const matches=[...content.matchAll(/build=\s*"([a-f0-9]{64})"/g)];
 if(matches.length!==1)throw Error('candidate-content-fingerprint-missing-or-ambiguous');
 const profile=readFileSync(join(unpacked,'src/host/chatgpt-observed-profile.mjs'),'utf8');
 const revisions=[...profile.matchAll(/id:'chatgpt-zh-desktop-observed-20261018',revision:(\d+),/g)];
 if(revisions.length!==1)throw Error('candidate-observed-profile-revision-unavailable');
 const actualRevision=Number(revisions[0][1]);
 if(profileRevision!==undefined&&profileRevision!==actualRevision)throw Error('candidate-profile-revision-mismatch');
 const entry=readFileSync(join(unpacked,'src/host/content-session.mjs'),'utf8');
 if(!/import\s*\{\s*createFlowMountSurface\s*\}\s*from\s*['"]\.\.\/navigation\/flow-mount-surface\.mjs['"]/.test(entry))throw Error('candidate-flow-backend-unverified');
 const archiveBytes=readFileSync(archive),entries=[...Object.keys(info.files),'build-manifest.json'].sort().map(name=>({name,data:readFileSync(join(unpacked,name))}));
 if(!archiveBytes.equals(zip(entries)))throw Error('candidate-archive-unpacked-mismatch');
 return {codeSHA,sourceClosureSHA256:sourceClosureHash(info.sourceHashes),contentFingerprint:matches[0][1],
  packageSHA256:hash(archiveBytes),backend:'document-flow',authorityMode:info.browserLocal?'BROWSER_LOCAL':info.contextSelection,
  profileRevision:actualRevision,packageKind:info.status,origin:info.origin,buildManifestSHA256:hash(manifestBytes),sourceHashes:info.sourceHashes};
}

/** Missing, partial, old-source or synthetic-live receipts never produce a product PASS. */
export function productCandidateReport({candidate,observations=[],blockedBy=[]}){
 if(!validIdentity(candidate)||candidate.authorityMode!=='BROWSER_LOCAL'||candidate.packageKind!=='HOST_IMPLEMENTATION_UNVERIFIED'||candidate.origin!=='https://chatgpt.com'||!Array.isArray(observations)||observations.some(x=>!plain(x))||new Set(observations.map(x=>x.journey)).size!==observations.length||!Array.isArray(blockedBy)||blockedBy.some(x=>typeof x!=='string'||!x.trim()))throw Error('invalid-product-report-input');
 const known=new Set(PRODUCT_CASES.map(x=>x.journey));
 if(observations.some(x=>!known.has(x.journey)))throw Error('unknown-product-journey');
 const cases=PRODUCT_CASES.map(({journey,level})=>{
  const observation=observations.find(x=>x.journey===journey),identity=observation?.identity??{};
  let outcome=observation?.outcome??'NOT_RUN',reason=observation?.blockedBy??({PASS:null,FAIL:'CASE_FAILED',PARTIAL:'PARTIAL_COVERAGE',NOT_RUN:'NOT_EXECUTED'}[outcome]);
  if(!['PASS','FAIL','NOT_RUN','PARTIAL'].includes(outcome))throw Error('invalid-product-outcome');
  const recordedOutcome=outcome;
  if(observation&&outcome!=='NOT_RUN'){
   if(identity.codeSHA!==candidate.codeSHA||identity.sourceClosureSHA256!==candidate.sourceClosureSHA256){outcome='NOT_RUN';reason='DIFFERENT_SOURCE_CANDIDATE';}
   else if(identity.backend!==candidate.backend||identity.profileRevision!==candidate.profileRevision){outcome='NOT_RUN';reason='DIFFERENT_HOST_CONTRACT';}
   else if(outcome==='PASS'){
    if(observation.exitCode!==0||typeof observation.evidencePath!=='string'||!observation.evidencePath||!sha256(observation.evidenceSHA256)){outcome='FAIL';reason='MISSING_SUCCESS_RECEIPT';}
    else if(reason){outcome='PARTIAL';}
    else if(level==='L1'&&observation.evidenceClass!==(journey==='node-contracts'?'NODE_CONTRACTS':'BROWSER_MECHANISM_ONLY')){outcome='NOT_RUN';reason='WRONG_EVIDENCE_CLASS';}
    else if(journey!=='node-contracts'&&(typeof observation.browserVersion!=='string'||!/^\d+\.\d+\.\d+\.\d+$/.test(observation.browserVersion)||!(validViewport(observation.viewport)||Array.isArray(observation.viewport)&&observation.viewport.length&&observation.viewport.every(validViewport))||!sha256(observation.fixtureSetSHA256))){outcome='NOT_RUN';reason='INCOMPLETE_BROWSER_PROVENANCE';}
    else if(level!=='L1'&&!validIdentity(identity)){outcome='NOT_RUN';reason='INCOMPLETE_PACKAGE_PROVENANCE';}
    else if(level==='L2'&&(observation.evidenceClass!=='PACKAGED_MV3_SYNTHETIC_HOST'||identity.packageKind!=='OFFLINE_HOST_RECONSTRUCTION'||identity.authorityMode!==(offlineAuthorities.get(journey)??'BROWSER_LOCAL'))){outcome='NOT_RUN';reason='WRONG_OFFLINE_PACKAGE_CONTRACT';}
    else if(level==='L3'&&(observation.evidenceClass!=='LIVE_AUTHORIZED_CHATGPT'||identity.packageKind!=='HOST_IMPLEMENTATION_UNVERIFIED'||identity.authorityMode!=='BROWSER_LOCAL'||identity.contentFingerprint!==candidate.contentFingerprint||identity.packageSHA256!==candidate.packageSHA256)){outcome='NOT_RUN';reason='LIVE_CANDIDATE_NOT_VERIFIED';}
   }
  }
  return {journey,level,acceptanceScope:journey.startsWith('UI10-')?'APPROVED_FREE_PERSONAL_OFFLINE':null,codeSHA:identity.codeSHA??candidate.codeSHA,sourceClosureSHA256:identity.sourceClosureSHA256??candidate.sourceClosureSHA256,
   contentFingerprint:identity.contentFingerprint??null,packageSHA256:identity.packageSHA256??null,backend:identity.backend??candidate.backend,
   authorityMode:identity.authorityMode??candidate.authorityMode,profileRevision:identity.profileRevision??candidate.profileRevision,
   packageKind:identity.packageKind??null,fixtureSetSHA256:observation?.fixtureSetSHA256??null,browserVersion:observation?.browserVersion??null,viewport:observation?.viewport??null,
   evidenceClass:observation?.evidenceClass??null,evidenceStatus:observation?.evidenceStatus??null,sourceOutcome:observation?.sourceOutcome??recordedOutcome,personalUXAcceptance:observation?.personalUXAcceptance??null,packages:observation?.packages??null,recordedOutcome,outcome,blockedBy:reason,evidencePath:observation?.evidencePath??null,evidenceSHA256:observation?.evidenceSHA256??null,receiptPath:observation?.receiptPath??null};
 });
 const levels=Object.fromEntries(['L1','L2','L3'].map(level=>{const rows=cases.filter(x=>x.level===level);return [level,{outcome:rows.every(x=>x.outcome==='PASS')?'PASS':rows.some(x=>x.outcome==='FAIL')?'FAIL':rows.every(x=>x.outcome==='NOT_RUN')?'NOT_RUN':'PARTIAL',pass:rows.filter(x=>x.outcome==='PASS').length,total:rows.length}];}));
 const complete=Object.values(levels).every(level=>level.outcome==='PASS');
 return {schema:'vaiwl-product-candidate-v1',candidate,cases,levels,blockedBy,personalDailyCandidate:complete?'READY':'NOT_READY',fullFree:complete&&blockedBy.length===0?'ACCEPTED':'NOT_ACCEPTED',publicRelease:'NOT_AUTHORIZED'};
}
