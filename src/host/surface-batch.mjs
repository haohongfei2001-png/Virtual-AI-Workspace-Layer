import {exactHostRecord} from './contract.mjs';
import {normalizedScope,tokenOK} from '../b1/identity.mjs';
const safeId=v=>tokenOK(v)&&!['__proto__','prototype','constructor'].includes(v);
const assert=(test,reason)=>{if(!test)throw Error(reason);};
/** Owner-side structural reduction. Does not establish scope, a receipt, or send time. */
export function surfaceBatch(proposal,{scope,binding,profile,urlPolicy,sourceRevision,observedAt,validUntil,knownProjects=[]}={}){
 assert(new TextEncoder().encode(JSON.stringify(proposal)).length<=65536,'host-proposal-too-large');
 const normalized=normalizedScope(scope);assert(normalized,'unverified-scope');
 assert(exactHostRecord(proposal,['protocol','documentToken','producerToken','localSeq','routeEpoch','profileId','profileVersion','bodyProofId','kind','payload']),'invalid-host-proposal');
 assert(proposal.protocol==='vaiwl-host-observation/1'&&proposal.kind==='surface-delta'&&proposal.bodyProofId===null,'unsupported-host-proposal');
 assert(proposal.documentToken===binding.documentToken&&proposal.producerToken===binding.producerToken&&proposal.routeEpoch===binding.routeEpoch,'stale-host-proposal');
 assert(Number.isSafeInteger(proposal.localSeq)&&proposal.localSeq>0&&proposal.profileId===profile.id&&proposal.profileVersion===profile.revision,'invalid-host-profile');
 const payload=proposal.payload;
 assert(exactHostRecord(payload,['candidates','membershipClaims','coverageClaims','detachedHandles']),'invalid-host-surface');
 assert(Array.isArray(payload.candidates)&&payload.candidates.length<=256&&Array.isArray(payload.membershipClaims)&&payload.membershipClaims.length<=256&&Array.isArray(payload.coverageClaims)&&payload.coverageClaims.length===0&&Array.isArray(payload.detachedHandles)&&payload.detachedHandles.length<=512&&payload.detachedHandles.every(safeId),'invalid-host-surface');
 const evidence=(v)=>{
  assert(exactHostRecord(v,['profileId','profileVersion','sourceKind','regionEpoch','fieldPaths','receiptId'])&&v.profileId===profile.id&&v.profileVersion===profile.revision&&v.sourceKind==='native-dom'&&v.receiptId===null&&Number.isSafeInteger(v.regionEpoch)&&v.regionEpoch>=0&&Array.isArray(v.fieldPaths)&&v.fieldPaths.length>0&&v.fieldPaths.length<=8&&v.fieldPaths.every(p=>typeof p==='string'&&p.length<=80),'invalid-host-locator');
 };
 const handle=(v,kind)=>assert(exactHostRecord(v,['id','documentToken','routeEpoch','regionEpoch','controlKind'])&&safeId(v.id)&&v.documentToken===binding.documentToken&&v.routeEpoch===binding.routeEpoch&&Number.isSafeInteger(v.regionEpoch)&&v.regionEpoch>=0&&v.controlKind===kind,'invalid-host-handle');
 const projects=new Map(),refs=new Map(),membership=new Map();
 for(const candidate of payload.candidates){
  assert(exactHostRecord(candidate,['renderKey','entity','nativeTitle','titleState','target','evidence'])&&['project','conversation'].includes(candidate.entity),'invalid-host-candidate');
  evidence(candidate.evidence);
  assert(['exact','unavailable','over-limit'].includes(candidate.titleState)&&(candidate.titleState==='exact'?typeof candidate.nativeTitle==='string'&&candidate.nativeTitle.trim().length>0&&candidate.nativeTitle.length<=200:candidate.nativeTitle===null),'invalid-host-title');
  const target=candidate.target;
  if(target?.kind==='live-control'){
   assert(exactHostRecord(target,['kind','control','navigationURL'])&&target.navigationURL===null,'invalid-host-target');handle(target.control,candidate.entity);
   assert(candidate.renderKey===`candidate:${target.control.id}`,'invalid-render-key');continue;
  }
  assert(exactHostRecord(target,['kind','entity','nativeId','navigationURL','liveHandle'])&&target.kind==='resolved'&&target.entity===candidate.entity&&safeId(target.nativeId),'invalid-host-target');
  if(target.liveHandle!==null)handle(target.liveHandle,candidate.entity);
  const parsed=urlPolicy.parse(target.navigationURL);
  assert(parsed.kind===candidate.entity&&(parsed.projectId??parsed.conversationId)===target.nativeId&&candidate.renderKey===`${candidate.entity}:${target.nativeId}`,'host-identity-conflict');
  const row={id:target.nativeId,[candidate.entity==='project'?'nativeName':'nativeTitle']:candidate.nativeTitle,nativeUrl:parsed.navigationURL,availability:'available'};
  const table=candidate.entity==='project'?projects:refs,prior=table.get(row.id);
  assert(!prior||JSON.stringify(prior)===JSON.stringify(row),'host-candidate-conflict');table.set(row.id,row);
 }
 const projectIds=new Set([...knownProjects,...projects.keys()]);
 for(const claim of payload.membershipClaims){
  const unknown=claim?.asserted==='UNKNOWN';
  assert(exactHostRecord(claim,['conversationId','asserted','projectId',unknown?'reason':'upstreamRevision','evidence'])&&safeId(claim.conversationId)&&['PROJECT','NONE','UNKNOWN'].includes(claim.asserted),'invalid-host-membership');evidence(claim.evidence);
  assert(unknown?typeof claim.reason==='string'&&/^[a-z0-9-]{1,80}$/.test(claim.reason):claim.upstreamRevision===null,'invalid-host-membership');
  if(claim.asserted==='PROJECT')assert(safeId(claim.projectId)&&claim.evidence.fieldPaths.includes('members')&&claim.evidence.fieldPaths.includes('current-project-route'),'invalid-host-membership');
  else assert(claim.projectId===null,'invalid-host-membership');
  if(claim.asserted==='NONE')assert(claim.evidence.fieldPaths.includes('moveMenu')&&claim.evidence.fieldPaths.includes('checked-no-project'),'invalid-host-none');
  // An absent observation neither unassigns an existing member nor manufactures a ref.
  if(unknown||!refs.has(claim.conversationId)||claim.asserted==='PROJECT'&&!projectIds.has(claim.projectId))continue;
  const row={id:claim.conversationId,state:claim.asserted,projectId:claim.projectId},prior=membership.get(row.id);
  assert(!prior||JSON.stringify(prior)===JSON.stringify(row),'host-membership-conflict');membership.set(row.id,row);
 }
 return {scopeKey:normalized.key,sourceRevision,observedAt,validUntil,projects:[...projects.values()],refs:[...refs.values()],membership:[...membership.values()],inventory:{projects:'partial',conversations:'partial',cursor:null}};
}
