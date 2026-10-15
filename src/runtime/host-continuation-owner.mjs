import {digest} from '../data/hash.mjs';
import {normalizedScope,tokenOK} from '../b1/identity.mjs';
import {validateNativeContinuation} from '../data/native-observation-continuation.mjs';
const sourceFailures=new Set(['native-continuation-missing-source','native-continuation-source-revoked','native-continuation-source-changed','native-continuation-profile-changed']);
/** One owner-authorized recovery step. Persisted admission is data, never authority. */
export function createHostContinuationOwner({nativeRepository,evidenceRepository,profileFor=null}={}){
 if(!['listContinuations','markContinuationComplete','markContinuationNeedsRevalidation'].every(k=>typeof nativeRepository?.[k]==='function')||!['version','applyContinuation'].every(k=>typeof evidenceRepository?.[k]==='function')||(profileFor!==null&&typeof profileFor!=='function'))throw Error('invalid-host-continuation-owner');
 const admissions=new WeakMap(),cursors=new Map();let busy=null;
 function admission(scope,request){const entry=admissions.get(request);return entry&&normalizedScope(scope)?.key===entry.scopeKey&&entry.guard()?entry:null;}
 async function drain({scope,guard,signal,profileId,profileVersion,verify=null}={}){
  if(busy)return {state:'busy'};
  const normalized=normalizedScope(scope);
  if(!normalized||typeof guard!=='function'||(verify!==null&&typeof verify!=='function')||!tokenOK(profileId)||!Number.isSafeInteger(profileVersion)||profileVersion<1)return {state:'cancelled',reason:'invalid-continuation-authority'};
  let nativeProfile=null,nativeFingerprint=null;
  const attempt={active:true};busy=attempt;
  const current=()=>{try{if(!attempt.active||signal?.aborted||guard()!==true)return false;const profile=profileFor?.(profileId);return (!profileFor||(profile?.id===profileId&&profile.revision===profileVersion))&&(!nativeProfile||profileFor?.(nativeProfile.id)===nativeProfile&&digest([nativeProfile.id,nativeProfile.revision])===nativeFingerprint);}catch{return false;}};
  const check=()=>{if(!current())throw Error('stale-continuation-authority');};
  const options={guard:current,signal};let abortListener;
  const verifyCurrent=async()=>{check();if(verify){let valid=false;try{valid=await verify();}catch{}if(valid!==true){attempt.active=false;throw Error('stale-continuation-document');}}check();};
  async function run(){
   await verifyCurrent();const rows=await nativeRepository.listContinuations(normalized,options);await verifyCurrent();
   if(!Array.isArray(rows)||rows.length>256)throw Error('continuation-capacity');
   let total=0;for(const row of rows){total+=new TextEncoder().encode(JSON.stringify(row)).length;if(total>1048576)throw Error('continuation-capacity');validateNativeContinuation(row,normalized);}
   const pendingRows=rows.filter(r=>r.state==='pending-evidence'),matching=pendingRows.filter(r=>r.admission.profileId===profileId),candidates=matching.length?matching:pendingRows;
   if(!candidates.length)return {state:'idle'};
   const cursorKey=JSON.stringify([normalized.key,profileId]),previous=cursors.get(cursorKey),index=candidates.findIndex(r=>r.operationId===previous),row=candidates[(index+1)%candidates.length];
   cursors.delete(cursorKey);cursors.set(cursorKey,row.operationId);if(cursors.size>128)cursors.delete(cursors.keys().next().value);
   // Snapshot the selected data before the next await; only caller authority is live.
   const pending=structuredClone(row),mark={operationId:pending.operationId,expectedPayloadDigest:pending.payloadDigest};
   if(pending.admission.profileId!==profileId||pending.admission.profileVersion!==profileVersion){
    await verifyCurrent();
    // Other supported profiles may be draining this scope too; their identity is not revocation.
    const retirementOptions=pending.admission.profileId===profileId?{...options,currentProfile:()=>{check();return {id:profileId,revision:profileVersion};}}:options;
    const marked=await nativeRepository.markContinuationNeedsRevalidation(normalized,mark,retirementOptions);check();return marked?.ok===true?{state:'needs-revalidation',attempts:0,reason:marked.reason}:{state:'pending',attempts:0,reason:marked?.reason??'continuation-revalidation-failed'};
   }
   if(pending.nativeWitness){
    const n=pending.nativeWitness,profile=profileFor?.(n.profileId);
    if(!profile||profile.id!==n.profileId)return {state:'pending',attempts:0,reason:'unavailable-native-continuation-profile'};
    nativeProfile=profile;nativeFingerprint=digest([profile.id,profile.revision]);await verifyCurrent();
    if(profile.revision!==n.profileVersion){
     const marked=await nativeRepository.markContinuationNeedsRevalidation(normalized,mark,{...options,currentProfile:()=>{check();return {id:profile.id,revision:profile.revision};}});check();return marked?.ok===true?{state:'needs-revalidation',attempts:0,reason:marked.reason}:{state:'pending',attempts:0,reason:marked?.reason};
    }
   }
   for(let attempts=1;attempts<=2;attempts++){
    check();const expectedRevision=await evidenceRepository.version(normalized,options);await verifyCurrent();
    const request={operationId:pending.evidence.operationId,expectedRevision,nativeOperationId:pending.operationId,payloadDigest:pending.payloadDigest};
    admissions.set(request,Object.freeze({channel:'host-evidence',scopeKey:normalized.key,sourceId:pending.admission.sourceId,generation:pending.admission.generation,profileId,profileVersion,purpose:'native-continuation',nativeOperationId:pending.operationId,payloadDigest:pending.payloadDigest,guard:current}));
    let result;try{await verifyCurrent();result=await evidenceRepository.applyContinuation(normalized,request,options);}finally{admissions.delete(request);}check();
    if(result?.ok===true){await verifyCurrent();const completed=await nativeRepository.markContinuationComplete(normalized,{...mark,evidenceRevision:result.revision},options);check();return completed?.ok===true?{state:completed.state==='needs-revalidation'?'needs-revalidation':'complete',attempts,replayed:result.replayed===true,...(completed.reason?{reason:completed.reason}:{})}:{state:'pending',attempts,reason:completed?.reason??'continuation-completion-failed'};}
    if(sourceFailures.has(result?.reason)){await verifyCurrent();const marked=await nativeRepository.markContinuationNeedsRevalidation(normalized,mark,options);check();return marked?.ok===true?{state:'needs-revalidation',attempts,reason:marked.reason}:{state:'pending',attempts,reason:marked?.reason??'continuation-revalidation-failed'};}
    if(result?.reason!=='revision-conflict'||attempts===2)return {state:'pending',attempts,reason:result?.reason??'continuation-evidence-failed'};
   }
  }
  try{
   const work=run();
   if(!signal)return await work;
   const aborted=new Promise((_,reject)=>{abortListener=()=>{attempt.active=false;reject(Error('stale-continuation-authority'));};signal.addEventListener('abort',abortListener,{once:true});if(signal.aborted)abortListener();});
   return await Promise.race([work,aborted]);
  }catch(error){return {state:current()?'pending':'cancelled',reason:error?.message??'continuation-failed'};}
  finally{attempt.active=false;if(abortListener)signal.removeEventListener('abort',abortListener);if(busy===attempt)busy=null;}
 }
 return Object.freeze({admission,drain});
}
