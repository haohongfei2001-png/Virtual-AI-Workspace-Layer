/** Frozen pre-joint v1 codec: compatibility oracle only, never used by product. */
import {normalizedScope,isRecord,tokenOK} from '../../../src/b1/identity.mjs';
import {instant} from '../../../src/navigation/projection.mjs';
import {digest} from '../../../src/data/hash.mjs';
import {applyFreeEvidence,emptyFreeEvidence} from '../../../src/data/free-evidence.mjs';
const REASONS=['source-revoked','source-changed','profile-changed','missing-source','evidence-conflict'];
const FORMAT='vaiwl-native-continuation-v1',DIRECTORY='vaiwl-native-continuation-directory-v1';
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const fail=reason=>{throw Error('invalid-native-continuation-'+reason);};
function shape(value,keys){if(!isRecord(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('schema');for(const k of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))fail('schema');}
function id(value){if(!tokenOK(value)||['__proto__','constructor','prototype'].includes(value))fail('id');}
function revision(value,minimum=0){if(!Number.isSafeInteger(value)||value<minimum)fail('revision');}
function scopeKey(scope){const normalized=normalizedScope(scope);if(!normalized)fail('scope');return normalized.key;}
export function continuationSemanticFingerprint(batch){if(!Array.isArray(batch?.hints)||batch.hints.length<1||batch.hints.length>256)fail('batch');return digest(batch.hints.map(h=>({conversationId:h.conversationId,messageId:h.messageId,eventKey:h.eventKey,actorVerified:h.actorVerified,actorScopeKey:h.actorScopeKey,ackWitness:h.ackWitness})).sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;}));}
function validateEvidence(evidence,admission,scope){
 shape(evidence,['operationId','expectedRevision','batch']);id(evidence.operationId);revision(evidence.expectedRevision);
 const batch=evidence.batch;shape(batch,['sources','events','hints','coverage']);
 if(!Array.isArray(batch.sources)||batch.sources.length!==1||!Array.isArray(batch.events)||batch.events.length||!Array.isArray(batch.coverage)||batch.coverage.length||!Array.isArray(batch.hints)||batch.hints.length<1||batch.hints.length>256)fail('batch');
 const source=batch.sources[0];
 if(!source||source.id!==admission.sourceId||source.generation!==admission.generation||source.profileId!==admission.profileId||source.profileVersion!==admission.profileVersion||source.channel!=='host-evidence'||source.codecVersion!==1)fail('source');
 for(const h of batch.hints)if(h.sourceId!==admission.sourceId||h.generation!==admission.generation||h.hintType!=='observed-self-send')fail('source');
 applyFreeEvidence(emptyFreeEvidence(scope),{type:'OBSERVE_FREE_EVIDENCE',batch},{scope,now:admission.acceptedAt,channel:'host-evidence'});
 if(continuationSemanticFingerprint(batch)!==admission.semanticFingerprint)fail('semantic');
}
/** Codec only: persisted admission never replaces current owner authorization. */
export function validateNativeContinuation(record,scope){
 const common=['format','scopeKey','operationId','nativeRevision','state','admission','payloadDigest'];
 if(record?.state==='pending-evidence')shape(record,[...common,'evidence']);
 else if(record?.state==='complete')shape(record,[...common,'evidenceOperationId','evidenceRevision']);
 else if(record?.state==='needs-revalidation')shape(record,[...common,'evidenceOperationId','targets','reason']);
 else fail('record');
 if(record.format!==FORMAT||record.scopeKey!==scopeKey(scope))fail('record');
 id(record.operationId);revision(record.nativeRevision,1);
 const a=record.admission;shape(a,['scopeKey','sourceId','generation','profileId','profileVersion','evidenceClass','semanticFingerprint','acceptedAt']);
 if(a.scopeKey!==record.scopeKey||a.evidenceClass!=='observed-self-send'||instant(a.acceptedAt)===null)fail('admission');
 for(const k of ['sourceId','generation','profileId'])id(a[k]);revision(a.profileVersion,1);
 if(typeof a.semanticFingerprint!=='string'||! /^[0-9a-f]{64}$/.test(a.semanticFingerprint))fail('semantic');
 if(bytes(record)>65536)fail('record-capacity');
 if(typeof record.payloadDigest!=='string'||! /^[0-9a-f]{64}$/.test(record.payloadDigest))fail('digest');
 if(record.state==='pending-evidence'){validateEvidence(record.evidence,a,scope);if(record.payloadDigest!==digest(record.evidence))fail('digest');}
 else {id(record.evidenceOperationId);if(record.state==='complete')revision(record.evidenceRevision,1);
 else {if(!REASONS.includes(record.reason)||!Array.isArray(record.targets)||record.targets.length<1||record.targets.length>256||new Set(record.targets).size!==record.targets.length)fail('targets');for(const target of record.targets)id(target);}}
 return record;
}
export function createNativeContinuation({scope,operationId,nativeRevision,authority,proposal,now}){
 shape(proposal,['evidenceOperationId','expectedEvidenceRevision','batch']);
 const a=authority?.admission;
 if(authority?.channel!=='host-dom'||!a||a.evidenceClass!=='observed-self-send')fail('authority');
 const evidence=structuredClone({operationId:proposal.evidenceOperationId,expectedRevision:proposal.expectedEvidenceRevision,batch:proposal.batch});
 const record={format:FORMAT,scopeKey:scopeKey(scope),operationId,nativeRevision,state:'pending-evidence',admission:{scopeKey:scopeKey(scope),sourceId:authority.sourceId,generation:authority.generation,profileId:a.profileId,profileVersion:a.profileVersion,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(evidence.batch),acceptedAt:a.acceptedAt},evidence,payloadDigest:digest(evidence)};
 // The owner's semantic commitment must match; this equality grants no authority.
 if(a.semanticFingerprint!==record.admission.semanticFingerprint||instant(a.acceptedAt)===null||instant(now)===null||instant(a.acceptedAt)>instant(now))fail('admission');
 return validateNativeContinuation(record,scope);
}
export function continuationDirectoryKey(key){if(typeof key!=='string'||!key||key.length>1024)fail('scope');return JSON.stringify([key,'native-continuations','directory']);}
export function emptyContinuationDirectory(scope){return {format:DIRECTORY,scopeKey:scopeKey(scope),revision:0,entries:{}};}
export function validateContinuationDirectory(directory,scope){
 shape(directory,['format','scopeKey','revision','entries']);if(directory.format!==DIRECTORY||directory.scopeKey!==scopeKey(scope)||!isRecord(directory.entries))fail('directory');revision(directory.revision);
 const keys=Reflect.ownKeys(directory.entries);if(keys.length>256)fail('directory-capacity');let total=0;
 for(const key of keys){id(key);const property=Object.getOwnPropertyDescriptor(directory.entries,key);if(!Object.hasOwn(property,'value'))fail('directory');const size=property.value;if(!Number.isSafeInteger(size)||size<1||size>65536)fail('directory');total+=size;}
 if(total>1048576)fail('directory-capacity');return directory;
}
export function updateContinuationDirectory(directory,record,scope,existingRecord=null){validateContinuationDirectory(directory,scope);validateNativeContinuation(record,scope);if(record.state!=='pending-evidence')fail('transition');if(Object.hasOwn(directory.entries,record.operationId)){if(!existingRecord)fail('existing-record-required');validateNativeContinuation(existingRecord,scope);if(existingRecord.operationId!==record.operationId||bytes(existingRecord)!==directory.entries[record.operationId]||digest(existingRecord)!==digest(record))fail('operation-conflict');return directory;}if(existingRecord)fail('orphan-record');const next=structuredClone(directory);next.revision++;next.entries[record.operationId]=bytes(record);return validateContinuationDirectory(next,scope);}

function embeddedScope(record){let parts;try{parts=JSON.parse(record.scopeKey);}catch{fail('scope');}if(!Array.isArray(parts)||parts.length!==3)fail('scope');const scope={verified:true,provider:parts[0],accountId:parts[1],organizationId:parts[2]};if(scopeKey(scope)!==record.scopeKey)fail('scope');return scope;}
function terminal(pending){const scope=embeddedScope(pending);validateNativeContinuation(pending,scope);if(pending.state!=='pending-evidence')fail('transition');const {evidence,...base}=structuredClone(pending);return {scope,base,evidence};}
export function finishNativeContinuation(pending,options){shape(options,['evidenceRevision']);const {scope,base,evidence}=terminal(pending);return validateNativeContinuation({...base,state:'complete',evidenceOperationId:evidence.operationId,evidenceRevision:options.evidenceRevision},scope);}
export function deferNativeContinuation(pending,options){shape(options,['reason']);const {scope,base,evidence}=terminal(pending);return validateNativeContinuation({...base,state:'needs-revalidation',evidenceOperationId:evidence.operationId,targets:[...new Set(evidence.batch.hints.map(h=>h.conversationId))].sort(),reason:options.reason},scope);}
export function transitionContinuationDirectory(directory,prior,next,scope){
 validateContinuationDirectory(directory,scope);validateNativeContinuation(prior,scope);validateNativeContinuation(next,scope);
 if(prior.state!=='pending-evidence'||!['complete','needs-revalidation'].includes(next.state))fail('transition');
 if(!Object.hasOwn(directory.entries,prior.operationId)||directory.entries[prior.operationId]!==bytes(prior))fail('directory-conflict');
 for(const key of ['format','scopeKey','operationId','nativeRevision','admission','payloadDigest'])if(digest(prior[key])!==digest(next[key]))fail('operation-conflict');
 if(next.evidenceOperationId!==prior.evidence.operationId)fail('operation-conflict');
 if(next.state==='needs-revalidation'&&digest(next.targets)!==digest([...new Set(prior.evidence.batch.hints.map(h=>h.conversationId))].sort()))fail('targets');
 const updated=structuredClone(directory);updated.revision++;
 if(next.state==='complete')delete updated.entries[prior.operationId];else updated.entries[prior.operationId]=bytes(next);
 return validateContinuationDirectory(updated,scope);
}
/** Stable identity for the dedicated continuation write, never the legacy CAS path. */
export function continuationEvidenceFingerprint(record,scope){
 validateNativeContinuation(record,scope);
 const {scopeKey,operationId,payloadDigest,admission}=record;
 return digest({kind:'OBSERVE_HOST_CONTINUATION',scopeKey,operationId,payloadDigest,admission});
}
