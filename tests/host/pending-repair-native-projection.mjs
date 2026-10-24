/** TEST ONLY diagnostic projection of already-read state. Never acceptance,
 * authority, extra reads, timestamps renewed in storage, or raw content output. */
import {digest} from '../../src/data/hash.mjs';
const phases=['CUT','REPAIRED','DRAIN'];
// native-facts.mjs declares exactly these row witness fields. Every other field
// (including IDs, aliases, availability and memberCount) remains semantic input.
const witnessFields=['sourceId','generation','sourceRevision','observedAt','validUntil'];
const time=value=>{const n=typeof value==='string'?Date.parse(value):NaN;return Number.isSafeInteger(n)?n:null;};
export function projectPendingRepairNative(state,pending,phase,capturedAtMs=Date.now()){
 const unavailable=reason=>({phase:phases.includes(phase)?phase:'UNKNOWN',status:'UNAVAILABLE',reason});
 if(!phases.includes(phase)||!Number.isSafeInteger(capturedAtMs)||capturedAtMs<0)return unavailable('INVALID_CAPTURE');
 try{
  const facts=state.native,source=facts.sources[pending.nativeWitness.sourceId],tables={};
  if(!source)return unavailable('SOURCE_MISSING');
  if(time(source.observedAt)===null||time(source.validUntil)===null||time(source.validUntil)<=time(source.observedAt))return unavailable('INVALID_TIMESTAMPS');
  for(const table of ['projects','refs','membership']){
   const rows=facts[table],ids=Object.keys(rows);if(ids.length>512)return unavailable('ROW_LIMIT');
   const semantic={},witness={};let expiredRowCount=0,invalidTimeCount=0,minValidUntilMs=null,maxValidUntilMs=null;
   for(const id of ids){const row=rows[id],s={},w={};
    const required=[...witnessFields,'id',...(table==='membership'?['state','projectId']:['nativeUrl','availability',table==='projects'?'nativeName':'nativeTitle'])];
    if(required.some(field=>!Object.hasOwn(row,field)))return unavailable('MISSING_ROW_FIELD');
    for(const field of Object.keys(row))(witnessFields.includes(field)?w:s)[field]=row[field];
    semantic[id]=s;witness[id]=w;
    const observed=time(row.observedAt),until=time(row.validUntil);
    if(observed===null||until===null||until<=observed)return unavailable('INVALID_TIMESTAMPS');
    if(until!==null){if(until<=capturedAtMs)expiredRowCount++;minValidUntilMs=minValidUntilMs===null?until:Math.min(minValidUntilMs,until);maxValidUntilMs=maxValidUntilMs===null?until:Math.max(maxValidUntilMs,until);}
   }
   // Explicit byte ceiling also bounds pathological individual string values.
   if(JSON.stringify(rows).length>1048576)return unavailable('BYTE_LIMIT');
   tables[table]={count:ids.length,semanticDigest:digest(semantic),witnessDigest:digest(witness),structureDigest:digest(rows),expiredRowCount,invalidTimeCount,minValidUntilMs,maxValidUntilMs};
  }
  if(source&&JSON.stringify(source).length>16384)return unavailable('BYTE_LIMIT');
  const observedAtMs=time(source?.observedAt),validUntilMs=time(source?.validUntil);
  return {phase,status:'READ_ONLY_DIAGNOSTIC',capturedAtMs,readConsistency:'EXISTING_MULTI_READ_NOT_ATOMIC',proposalKind:'NOT_PERSISTED',proposalRegionEpoch:'NOT_PERSISTED',source:{present:!!source,observedAtMs,validUntilMs,expired:validUntilMs===null?null:validUntilMs<=capturedAtMs,timeValid:observedAtMs!==null&&validUntilMs!==null&&validUntilMs>observedAtMs,revision:Number.isSafeInteger(source?.sourceRevision)?source.sourceRevision:null,structureDigest:source?digest(source):null},tables};
 }catch{return unavailable('INVALID_STATE');}
}
