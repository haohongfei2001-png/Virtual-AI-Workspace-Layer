import {exactHostRecord} from './contract.mjs';
export const CURRENT_OBSERVATION_PROTOCOL='vaiwl-host-observation/2';
const keys=['protocol','documentToken','producerToken','localSeq','routeEpoch','profileId','profileVersion','bodyProofId','kind','payload'];
/** One bounded observation, never a fragment and never an authority assertion. */
export function splitCurrentObservation(value){
 if(!exactHostRecord(value,keys)||value.protocol!==CURRENT_OBSERVATION_PROTOCOL||value.kind!=='current-observation'||value.bodyProofId!==null||!exactHostRecord(value.payload,['body','surface'])||new TextEncoder().encode(JSON.stringify(value)).length>65536)throw Error('invalid-current-observation-batch');
 const common={...value,protocol:'vaiwl-host-observation/1'};
 return {body:{...common,kind:'current-object',payload:value.payload.body},surface:{...common,kind:'surface-delta',payload:value.payload.surface}};
}
export function currentObservation(body,surface){
 const value={...body,protocol:CURRENT_OBSERVATION_PROTOCOL,kind:'current-observation',payload:{body:body.payload,surface}};splitCurrentObservation(value);return value;
}
/** Select only actually observed current-C rows and their named project. Omission
 * remains partial/UNKNOWN; never synthesize membership or a complete inventory. */
export function currentSurfaceSlice(surface,conversationId){
 if(!surface.candidates.some(r=>r.entity==='conversation'&&r.target?.kind==='resolved'&&r.target.nativeId===conversationId))return {candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]};
 const membershipClaims=surface.membershipClaims.filter(r=>r.conversationId===conversationId),projects=new Set(membershipClaims.filter(r=>r.asserted==='PROJECT').map(r=>r.projectId));
 return {candidates:surface.candidates.filter(r=>r.target?.kind==='resolved'&&(r.entity==='conversation'&&r.target.nativeId===conversationId||r.entity==='project'&&projects.has(r.target.nativeId))),membershipClaims,coverageClaims:[],detachedHandles:[]};
}

export function validateCurrentSurfaceRelation({body,surface}){
 const c=body.payload.conversationId,p=surface.payload,claims=p.membershipClaims;
 if(p.coverageClaims.length||p.detachedHandles.length||claims.some(r=>r.conversationId!==c))throw Error('unrelated-current-observation');
 const projects=new Set(claims.filter(r=>r.asserted==='PROJECT').map(r=>r.projectId));
 if(p.candidates.some(r=>r.target?.kind!=='resolved'||!(r.entity==='conversation'&&r.target.nativeId===c||r.entity==='project'&&projects.has(r.target.nativeId))))throw Error('unrelated-current-observation');
 if((p.candidates.length||claims.length)&&!p.candidates.some(r=>r.entity==='conversation'&&r.target.nativeId===c))throw Error('missing-current-observation-target');
}
