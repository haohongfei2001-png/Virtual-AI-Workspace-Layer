/** Split one partial DOM observation without inventing coverage or truncating names. */
export function splitSurfacePayload(payload,envelope,{maxBytes=65536}={}){
 if(payload.coverageClaims.length||payload.candidates.length>256||payload.membershipClaims.length>256||payload.detachedHandles.length>512)throw Error('invalid-surface-fragment-input');
 const empty=()=>({candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]});
 const fits=p=>p.candidates.length<=256&&p.membershipClaims.length<=256&&p.detachedHandles.length<=512&&new TextEncoder().encode(JSON.stringify({...envelope,localSeq:Number.MAX_SAFE_INTEGER,payload:p})).length<=maxBytes;
 if(!fits(empty()))throw Error('host-proposal-too-large');
 const seen=new Map();for(const candidate of payload.candidates){const key=candidate.renderKey,target=candidate.target,semantic=JSON.stringify(target.kind==='resolved'?{entity:candidate.entity,nativeTitle:candidate.nativeTitle,nativeId:target.nativeId,navigationURL:target.navigationURL}:candidate);if(seen.has(key)&&seen.get(key)!==semantic)throw Error('host-candidate-conflict');seen.set(key,semantic);}
 if(fits(payload))return [structuredClone(payload)];
 const projects=new Map(payload.candidates.filter(c=>c.entity==='project'&&c.target.kind==='resolved').map(c=>[c.target.nativeId,c]));
 const usedClaims=new Set(),units=payload.candidates.map(candidate=>{
  const unit=empty();unit.candidates.push(candidate);
  if(candidate.entity==='conversation'&&candidate.target.kind==='resolved')for(const claim of payload.membershipClaims)if(claim.conversationId===candidate.target.nativeId){unit.membershipClaims.push(claim);usedClaims.add(claim);const project=projects.get(claim.projectId);if(project&&!unit.candidates.includes(project))unit.candidates.push(project);}
  return unit;
 });
 for(const claim of payload.membershipClaims)if(!usedClaims.has(claim)){const unit=empty();unit.membershipClaims.push(claim);units.push(unit);}
 for(const handle of payload.detachedHandles){const unit=empty();unit.detachedHandles.push(handle);units.push(unit);}
 const merge=(a,b)=>({candidates:[...a.candidates,...b.candidates.filter(c=>!a.candidates.some(prior=>prior.renderKey===c.renderKey&&JSON.stringify(prior)===JSON.stringify(c)))],membershipClaims:[...a.membershipClaims,...b.membershipClaims],coverageClaims:[],detachedHandles:[...a.detachedHandles,...b.detachedHandles]});
 const parts=[];let part=empty();for(const unit of units){const next=merge(part,unit);if(fits(next)){part=next;continue;}if(!fits(unit))throw Error('host-proposal-too-large');parts.push(part);part=unit;}parts.push(part);
 return structuredClone(parts);
}
