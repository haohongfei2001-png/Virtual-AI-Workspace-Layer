import { dataset, FIXTURE_NOW } from './data.mjs';
import { emptyState, validateState, placementId } from '../src/data/state.mjs';
/** This is a privileged SYNTHETIC fixture provider, not a ChatGPT importer. */
export function syntheticEvidenceGate(scope){return scope?.provider==='hf_synthetic_only'&&['A','B'].includes(scope.accountId)&&scope.organizationId==='fixture_org'?'synthetic':null;}
export function persistentSeed(scope,origin){
  if(syntheticEvidenceGate(scope)!=='synthetic')throw Error('not-synthetic-scope');
  const data=dataset(scope.accountId,origin,120),s=emptyState(scope);s.revision=1;s.channel='synthetic';
  s.sources.fixture_v1={id:'fixture_v1',channel:'hf-controlled-fixture-v1',observedAt:FIXTURE_NOW,description:'Invented test evidence. Not a production source or account witness.',trustLevel:'synthetic',revoked:false};
  for(const r of data.refs){
    s.refs[r.id]={id:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId,nativeTitle:r.nativeTitle,available:r.available};
    s.identities[r.id]={id:r.id,title:r.displayTitle,aliases:[],locked:false,owner:'bootstrap',revision:1};
    for(const e of r.events){const eid='event_'+r.id;s.events[eid]={id:eid,sourceId:'fixture_v1',conversationId:r.id,messageId:e.messageId,branchId:e.branchId,role:'user',kind:'new-send',sendState:'committed',sentAt:e.sentAt,precision:'second',observedAt:FIXTURE_NOW,revoked:false};}
    const cid='coverage_'+r.id,c=r.coverage;
    s.coverage[cid]={id:cid,sourceId:'fixture_v1',conversationId:r.id,from:c.from,through:c.through,observedAt:FIXTURE_NOW,completeness:c.gaps?'partial':'complete',branches:'all',gaps:[],revoked:false};
  }
  data.themes.forEach((w,index)=>{
    s.workspaces[w.id]={id:w.id,name:w.name,icon:'◇',order:index,locked:false,owner:'bootstrap',revision:1,seedIndex:index};
    w.members.forEach((refId,order)=>{const pid=placementId(w.id,refId);s.placements[pid]={id:pid,workspaceId:w.id,refId,excluded:false,order,locked:false,owner:'bootstrap',revision:1};});
  });
  return validateState(s,s.scopeKey);
}
