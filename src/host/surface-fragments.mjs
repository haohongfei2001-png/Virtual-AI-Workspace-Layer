/** Split one partial DOM observation without inventing coverage or truncating names. */
export function splitSurfacePayload(payload,envelope,{maxBytes=65536}={}){
 if(payload.coverageClaims.length||payload.candidates.length>256||payload.membershipClaims.length>256||payload.detachedHandles.length>512)throw Error('invalid-surface-fragment-input');
 const empty=()=>({candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]}),encoder=new TextEncoder(),encoded=new Map(),sizes=new Map();
 const encoding=row=>{if(!encoded.has(row))encoded.set(row,JSON.stringify(row));return encoded.get(row);};
 const size=row=>{if(!sizes.has(row))sizes.set(row,encoder.encode(encoding(row)).length);return sizes.get(row);};
 const base=encoder.encode(JSON.stringify({...envelope,localSeq:Number.MAX_SAFE_INTEGER,payload:empty()})).length;
 if(base>maxBytes||!Number.isFinite(maxBytes))throw Error('host-proposal-too-large');
 const arrays=['candidates','membershipClaims','detachedHandles'];
 const bytes=p=>base+arrays.reduce((sum,key)=>sum+p[key].reduce((n,row)=>n+size(row),0)+Math.max(0,p[key].length-1),0);
 const seen=new Map();for(const candidate of payload.candidates){const key=candidate.renderKey,target=candidate.target,semantic=JSON.stringify(target.kind==='resolved'?{entity:candidate.entity,nativeTitle:candidate.nativeTitle,nativeId:target.nativeId,navigationURL:target.navigationURL}:candidate);if(seen.has(key)&&seen.get(key)!==semantic)throw Error('host-candidate-conflict');seen.set(key,semantic);}
 if(bytes(payload)<=maxBytes)return [structuredClone(payload)];
 const projects=new Map(payload.candidates.filter(c=>c.entity==='project'&&c.target.kind==='resolved').map(c=>[c.target.nativeId,c]));
 const usedClaims=new Set(),units=payload.candidates.map(candidate=>{
  const unit=empty();unit.candidates.push(candidate);
  if(candidate.entity==='conversation'&&candidate.target.kind==='resolved')for(const claim of payload.membershipClaims)if(claim.conversationId===candidate.target.nativeId){unit.membershipClaims.push(claim);usedClaims.add(claim);const project=projects.get(claim.projectId);if(project&&!unit.candidates.includes(project))unit.candidates.push(project);}
  return unit;
 });
 for(const claim of payload.membershipClaims)if(!usedClaims.has(claim)){const unit=empty();unit.membershipClaims.push(claim);units.push(unit);}
 for(const handle of payload.detachedHandles){const unit=empty();unit.detachedHandles.push(handle);units.push(unit);}
 const parts=[];let part=empty(),length=base,candidateEncodings=new Set();
 const addition=unit=>{const next={...unit,candidates:unit.candidates.filter(c=>!candidateEncodings.has(encoding(c)))};let delta=0;for(const key of arrays)delta+=next[key].reduce((n,row)=>n+size(row),0)+(next[key].length?next[key].length-(part[key].length?0:1):0);return {next,delta};};
 for(const unit of units){
  let add=addition(unit);
  if(length+add.delta>maxBytes||part.candidates.length+add.next.candidates.length>256||part.membershipClaims.length+add.next.membershipClaims.length>256||part.detachedHandles.length+add.next.detachedHandles.length>512){
   if(bytes(unit)>maxBytes)throw Error('host-proposal-too-large');parts.push(part);part=empty();length=base;candidateEncodings=new Set();add=addition(unit);
  }
  for(const key of arrays)part[key].push(...add.next[key]);for(const candidate of add.next.candidates)candidateEncodings.add(encoding(candidate));length+=add.delta;
 }
 parts.push(part);return structuredClone(parts);
}
