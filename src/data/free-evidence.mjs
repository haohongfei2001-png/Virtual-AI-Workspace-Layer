import {normalizedScope,isRecord,tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {stable} from './hash.mjs';
import {mergeFreeObservationHints} from './free-activity.mjs';
const tables=['sources','events','hints','coverage'];
const forbidden=new Set(['__proto__','constructor','prototype']);
const id=v=>{if(!tokenOK(v)||forbidden.has(v))throw Error('invalid-free-evidence-id');return v;};
const time=v=>{const n=instant(v);if(n===null)throw Error('invalid-free-evidence-time');return n;};
const revision=v=>{if(!Number.isSafeInteger(v)||v<1)throw Error('invalid-free-evidence-revision');};
function shape(value,required,optional=[]){if(!isRecord(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw Error('invalid-free-evidence-schema');}
function scopeKey(scope){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');return s.key;}
const witnessFields=['id','sourceId','generation','sourceRevision','observedAt','revoked'];
function witness(row,state){
 id(row.id);id(row.sourceId);id(row.generation);revision(row.sourceRevision);time(row.observedAt);
 const s=state.sources[row.sourceId];
 if(!s||s.generation!==row.generation||row.sourceRevision>s.sourceRevision||time(row.observedAt)>time(s.observedAt)||typeof row.revoked!=='boolean')throw Error('invalid-free-evidence-witness');
}
function span(value){shape(value,['from','through']);if(time(value.from)>time(value.through))throw Error('invalid-free-evidence-interval');}
function source(row){
 shape(row,['id','generation','sourceRevision','observedAt','validUntil','channel','revoked']);id(row.id);id(row.generation);revision(row.sourceRevision);
 if(row.channel!=='synthetic'||typeof row.revoked!=='boolean')throw Error('untrusted-free-evidence-source');
 if(time(row.validUntil)<=time(row.observedAt))throw Error('invalid-free-evidence-expiry');
}
function validateRow(table,row,state){
 if(table==='sources'){source(row);return;}
 witness(row,state);id(row.conversationId);
 if(table==='events'){
  shape(row,[...witnessFields,'conversationId','messageId','branchId','actorVerified','actorScopeKey','role','kind','sendState','sentAt','precision'],['sentInterval']);
  id(row.messageId);id(row.branchId);
  if(row.actorVerified!==true||row.actorScopeKey!==state.scopeKey||row.role!=='user'||row.kind!=='new-send'||row.sendState!=='committed')throw Error('unverified-free-send-author');
  if(['second','millisecond'].includes(row.precision)){
   if(row.sentInterval!==undefined||time(row.sentAt)>time(row.observedAt))throw Error('invalid-free-send-time');
  }else if(row.precision==='day'||row.precision==='interval'){
   if(row.sentAt!==null)throw Error('interval-is-not-exact-send');span(row.sentInterval);
   if(time(row.sentInterval.through)>time(row.observedAt))throw Error('future-free-send-interval');
  }else throw Error('unknown-free-send-time');
 }else if(table==='hints'){
  shape(row,[...witnessFields,'conversationId','eventKey','hintType','validUntil','candidateInterval'],['actorVerified','actorScopeKey','semanticsVerified']);id(row.eventKey);
  if(time(row.validUntil)<=time(row.observedAt))throw Error('invalid-free-hint-expiry');
  if(row.candidateInterval!==null){span(row.candidateInterval);if(time(row.candidateInterval.through)>time(row.observedAt))throw Error('future-free-hint');}
  if(row.hintType==='local-confirmed-send'){
   if(row.actorVerified!==true||row.actorScopeKey!==state.scopeKey||row.semanticsVerified!==undefined)throw Error('unverified-free-hint-author');
  }else if(row.hintType==='native-activity'){
   if(row.semanticsVerified!==true||row.candidateInterval===null||row.actorVerified!==undefined||row.actorScopeKey!==undefined)throw Error('unverified-free-hint-semantics');
  }else throw Error('unsupported-free-hint');
 }else{
  shape(row,[...witnessFields,'conversationId','from','through','completeness','branches','gaps']);
  if(!['complete','partial','unknown'].includes(row.completeness)||!['all','observed'].includes(row.branches)||!Array.isArray(row.gaps)||row.gaps.length>1000||time(row.from)>time(row.through)||time(row.through)>time(row.observedAt))throw Error('invalid-free-time-coverage');
  for(const gap of row.gaps){span(gap);if(time(gap.from)<time(row.from)||time(gap.through)>time(row.through))throw Error('free-coverage-gap-outside-range');}
 }
}
export function emptyFreeEvidence(scope){return {format:'vaiwl-free-evidence-v1',scopeKey:scopeKey(scope),revision:0,sources:{},events:{},hints:{},coverage:{}};}
export function validateFreeEvidence(state,scope){
 shape(state,['format','scopeKey','revision',...tables]);
 if(state.format!=='vaiwl-free-evidence-v1'||state.scopeKey!==scopeKey(scope)||!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('invalid-free-evidence-state');
 for(const table of tables){
  if(!isRecord(state[table])||Object.keys(state[table]).length>20000)throw Error('free-evidence-capacity');
  for(const [key,row] of Object.entries(state[table])){id(key);if(!isRecord(row)||row.id!==key)throw Error('invalid-free-evidence-row');validateRow(table,row,state);}
 }
 const hints=new Set();for(const h of Object.values(state.hints)){const key=JSON.stringify([h.sourceId,h.eventKey]);if(hints.has(key))throw Error('duplicate-free-hint-event');hints.add(key);}
 if(JSON.stringify(state).length>16*1024*1024)throw Error('free-evidence-too-large');return state;
}
const equal=(a,b)=>stable(a)===stable(b);
/** Call only behind broker authorization; synthetic is not a production trust label. */
export function applyFreeEvidence(state,command,{scope,now,channel}){
 validateFreeEvidence(state,scope);const clock=time(now);
 if(channel!=='synthetic')throw Error('untrusted-free-evidence-channel');
 const next=structuredClone(state);
 if(command?.type==='REVOKE_FREE_EVIDENCE_SOURCE'){
  shape(command,['type','sourceId']);id(command.sourceId);if(!next.sources[command.sourceId])throw Error('missing-free-evidence-source');next.sources[command.sourceId].revoked=true;
 }else{
  shape(command,['type','batch']);if(command.type!=='OBSERVE_FREE_EVIDENCE')throw Error('unsupported-free-evidence-command');
  shape(command.batch,tables);
  for(const table of tables){if(!Array.isArray(command.batch[table])||command.batch[table].length>5000)throw Error('invalid-free-evidence-batch');const ids=new Set();for(const r of command.batch[table]){id(r?.id);if(ids.has(r.id))throw Error('duplicate-free-evidence-row');ids.add(r.id);if(time(r.observedAt)>clock)throw Error('future-free-evidence-observation');}}
  for(const input of command.batch.sources){
   if(Object.hasOwn(input,'revoked'))throw Error('free-source-revocation-replay');
   const row={...input,revoked:false};source(row);const prior=next.sources[row.id];
   if(prior&&(prior.revoked||prior.generation!==row.generation))throw Error('revoked-free-source-replay');
   if(prior&&(prior.sourceRevision>row.sourceRevision||(prior.sourceRevision===row.sourceRevision&&!equal(prior,row))))throw Error('stale-free-source-revision');
   next.sources[row.id]=row;
  }
  for(const table of ['events','coverage'])for(const input of command.batch[table]){
   if(Object.hasOwn(input,'revoked'))throw Error('free-evidence-revocation-replay');
   const row={...input,revoked:false};validateRow(table,row,next);
   const src=next.sources[row.sourceId];if(src.revoked||time(src.validUntil)<=clock)throw Error('inactive-free-evidence-source');
   if(next[table][row.id]&&!equal(next[table][row.id],row))throw Error('immutable-free-evidence-conflict');next[table][row.id]=row;
  }
  const hints=[];for(const input of command.batch.hints){
   if(Object.hasOwn(input,'revoked'))throw Error('free-evidence-revocation-replay');
   const row={...input,revoked:false};validateRow('hints',row,next);const src=next.sources[row.sourceId];
   if(src.revoked||time(src.validUntil)<=clock)throw Error('inactive-free-evidence-source');
   if(time(row.validUntil)>time(src.validUntil))throw Error('hint-exceeds-source-expiry');hints.push(row);
  }
  const byEvent=new Map(Object.values(next.hints).map(h=>[JSON.stringify([h.sourceId,h.eventKey]),h]));
  for(const h of hints){const key=JSON.stringify([h.sourceId,h.eventKey]),old=byEvent.get(key);if(old&&(old.conversationId!==h.conversationId||old.hintType!==h.hintType))throw Error('free-hint-event-conflict');byEvent.set(key,old??h);}
  next.hints=mergeFreeObservationHints(next.hints,hints);
 }
 next.revision++;return validateFreeEvidence(next,scope);
}
