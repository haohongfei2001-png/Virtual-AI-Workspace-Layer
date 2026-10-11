import { preferenceIds, validatePreference } from './preferences.mjs';
import { normalizedScope, canonicalRef, tokenOK, isRecord } from '../b1/identity.mjs';
import { instant } from '../navigation/projection.mjs';
import { stable, digest } from './hash.mjs';
export const TABLES = ['refs','sources','events','coverage','workspaces','placements','identities','preferences'];
export const HUMAN_COMMANDS = ['CREATE_WORKSPACE','UPDATE_WORKSPACE','SET_TITLE','PLACE','MOVE','SET_PREFERENCE','REVOKE_SOURCE','REVOKE_EVIDENCE'];
const reserved=new Set(['__proto__','constructor','prototype']);
export function id(value){if(!tokenOK(value)||reserved.has(value))throw Error('invalid-id');return value;}
export function text(value,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('invalid-text');return value;}
export function exact(value,required,optional=[]){if(!isRecord(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw Error('invalid-schema');}
const time=value=>{if(instant(value)===null)throw Error('invalid-evidence-time');return value;};
const order=value=>{if(!Number.isSafeInteger(value)||Math.abs(value)>1e6)throw Error('invalid-order');return value;};
const bool=value=>{if(typeof value!=='boolean')throw Error('invalid-boolean');return value;};
export function placementId(workspaceId,refId){return 'p_'+digest([workspaceId,refId]);}
export function emptyState(scope){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');return {schema:2,scopeKey:s.key,revision:0,channel:'none',...Object.fromEntries(TABLES.map(k=>[k,{}]))};}
export function validateState(s,scopeKey){
  exact(s,['schema','scopeKey','revision','channel',...TABLES]);
  if(s.schema!==2||s.scopeKey!==scopeKey||!Number.isSafeInteger(s.revision)||s.revision<0||!['none','synthetic'].includes(s.channel))throw Error('invalid-state');
  for(const table of TABLES){if(!isRecord(s[table])||Object.keys(s[table]).length>20000)throw Error('invalid-state-table');for(const [key,v] of Object.entries(s[table])){id(key);if(!isRecord(v)||v.id!==key)throw Error('invalid-state-row');}}
  for(const r of Object.values(s.refs)){if(!canonicalRef({conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId}))throw Error('invalid-ref');text(r.nativeTitle);bool(r.available);}
  for(const q of Object.values(s.sources)){id(q.id);if(q.trustLevel!=='synthetic'||typeof q.revoked!=='boolean')throw Error('invalid-source');text(q.channel,100);text(q.description,500);time(q.observedAt);}
  for(const e of Object.values(s.events)){if(!Object.hasOwn(s.refs,id(e.conversationId))||!Object.hasOwn(s.sources,id(e.sourceId)))throw Error('orphan-event');id(e.messageId);id(e.branchId);bool(e.revoked);time(e.observedAt);if(e.sentAt!==null&&instant(time(e.sentAt))>instant(e.observedAt))throw Error('future-evidence');if(!['second','millisecond','day','unknown'].includes(e.precision)||e.role!=='user'||e.kind!=='new-send'||e.sendState!=='committed')throw Error('invalid-user-event');}
  for(const c of Object.values(s.coverage)){if(!Object.hasOwn(s.refs,id(c.conversationId))||!Object.hasOwn(s.sources,id(c.sourceId)))throw Error('orphan-coverage');validateCoverage(c);bool(c.revoked);}
  for(const w of Object.values(s.workspaces)){text(w.name);if(w.aliases!==undefined&&(!Array.isArray(w.aliases)||w.aliases.length>100||w.aliases.some(a=>typeof a!=='string'||a.length>200)))throw Error('invalid-alias');text(w.icon,16);order(w.order);bool(w.locked);if(!['human','candidate','bootstrap'].includes(w.owner))throw Error('invalid-owner');}
  for(const p of Object.values(s.placements)){if(!Object.hasOwn(s.refs,id(p.refId))||!Object.hasOwn(s.workspaces,id(p.workspaceId))||p.id!==placementId(p.workspaceId,p.refId))throw Error('orphan-placement');order(p.order);bool(p.excluded);bool(p.locked);if(!['human','candidate','bootstrap'].includes(p.owner))throw Error('invalid-owner');}
  for(const n of Object.values(s.identities)){if(!Object.hasOwn(s.refs,n.id))throw Error('orphan-title');text(n.title);bool(n.locked);if(!Array.isArray(n.aliases)||n.aliases.length>100||n.aliases.some(a=>typeof a!=='string'||a.length>200)||!['human','candidate','bootstrap'].includes(n.owner))throw Error('invalid-alias');}
  for(const p of Object.values(s.preferences))validatePreference(p,s,{exact,id,text});
  if(stable(s).length>16*1024*1024)throw Error('state-too-large');return s;
}
function validateCoverage(c){time(c.from);time(c.through);time(c.observedAt);if(instant(c.from)>instant(c.through)||instant(c.through)>instant(c.observedAt)||!['complete','partial'].includes(c.completeness)||!['all','known'].includes(c.branches)||!Array.isArray(c.gaps)||c.gaps.length>1000)throw Error('invalid-coverage');for(const g of c.gaps){exact(g,['from','through']);time(g.from);time(g.through);if(instant(g.from)>instant(g.through)||instant(g.from)<instant(c.from)||instant(g.through)>instant(c.through))throw Error('invalid-gap');}}
function protectedRow(row,actor){if(actor==='candidate'&&(row?.locked||row?.owner==='human'))throw Error('human-intent-protected');}
function need(table,key){id(key);if(!Object.hasOwn(table,key))throw Error('missing-object');return table[key];}
export function reduceCommand(current,command,actor='human'){
  validateState(current,current.scopeKey);if(!isRecord(command)||typeof command.type!=='string')throw Error('invalid-command');
  if(!['human','candidate','evidence','bootstrap'].includes(actor))throw Error('invalid-actor');
  const s=structuredClone(current),c=command,revision=current.revision+1;
  if(actor==='candidate'&&!['UPDATE_WORKSPACE','SET_TITLE','PLACE'].includes(c.type))throw Error('candidate-command-denied');
  const own={owner:actor==='evidence'?'bootstrap':actor,revision};
  switch(c.type){
    case 'CREATE_WORKSPACE':{
      exact(c,['type','id','name'],['icon','order']);id(c.id);if(s.workspaces[c.id])throw Error('workspace-exists');
      s.workspaces[c.id]={id:c.id,name:text(c.name),aliases:[],icon:text(c.icon??'◇',16),order:order(c.order??Object.keys(s.workspaces).length),locked:actor==='human',...own};break;
    }
    case 'UPDATE_WORKSPACE':{
      exact(c,['type','id'],['name','icon','order','locked']);const w=need(s.workspaces,c.id);protectedRow(w,actor);
      if('name'in c){const name=text(c.name);if(w.name!==name){w.aliases=[...new Set([...(w.aliases??[]),w.name])];if(w.aliases.length>100)throw Error('alias-capacity');}w.name=name;}if('icon'in c)w.icon=text(c.icon,16);if('order'in c)w.order=order(c.order);if('locked'in c){if(actor!=='human')throw Error('lock-denied');w.locked=bool(c.locked);}Object.assign(w,own);break;
    }
    case 'SET_TITLE':{
      exact(c,['type','refId','title'],['locked']);need(s.refs,c.refId);const old=s.identities[c.refId];protectedRow(old,actor);const title=text(c.title);
      const aliases=[...new Set([...(old?.aliases??[]),...(old?.title&&old.title!==title?[old.title]:[])])];if(aliases.length>100)throw Error('alias-capacity');
      s.identities[c.refId]={id:c.refId,title,aliases,locked:'locked'in c?bool(c.locked):actor==='human',...own};break;
    }
    case 'PLACE':{
      exact(c,['type','workspaceId','refId'],['excluded','order','locked']);need(s.refs,c.refId);need(s.workspaces,c.workspaceId);const key=placementId(c.workspaceId,c.refId),prior=s.placements[key];protectedRow(prior,actor);
      s.placements[key]={id:key,workspaceId:c.workspaceId,refId:c.refId,excluded:bool(c.excluded??false),locked:bool(c.locked??actor==='human'),order:order(c.order??prior?.order??0),...own};break;
    }
    case 'MOVE':{
      exact(c,['type','refId','from','to']);need(s.refs,c.refId);need(s.workspaces,c.from);need(s.workspaces,c.to);if(c.from===c.to)throw Error('same-workspace');
      const key=placementId(c.from,c.refId),prior=need(s.placements,key);if(prior.excluded)throw Error('not-placed');
      s.placements[key]={...prior,excluded:true,locked:true,...own};const target=placementId(c.to,c.refId);
      s.placements[target]={id:target,workspaceId:c.to,refId:c.refId,excluded:false,locked:true,order:prior.order,...own};break;
    }
    case 'SET_PREFERENCE':{
      exact(c,['type','id','value']);id(c.id);if(!preferenceIds.includes(c.id))throw Error('unknown-preference');
      s.preferences[c.id]={id:c.id,value:structuredClone(c.value),...own};break;
    }
    case 'INGEST':{
      if(!['evidence','bootstrap'].includes(actor))throw Error('untrusted-evidence-channel');
      exact(c,['type','batch']);const b=c.batch;exact(b,['schema','refs','sources','events','coverage']);if(b.schema!=='vaiwl-internal-evidence-v1')throw Error('unsupported-import-schema');
      for(const key of ['refs','sources','events','coverage'])if(!Array.isArray(b[key])||b[key].length>10000)throw Error('invalid-batch');
      for(const r of b.refs){exact(r,['id','nativeUrl','projectId','nativeTitle','available']);id(r.id);if(!canonicalRef({conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId}))throw Error('invalid-ref');text(r.nativeTitle);bool(r.available);
        if(s.refs[r.id]&&stable(s.refs[r.id])!==stable(r))throw Error('native-reference-conflict');s.refs[r.id]=structuredClone(r);}
      for(const q of b.sources){exact(q,['id','channel','observedAt','description']);id(q.id);text(q.channel,100);text(q.description,500);time(q.observedAt);const value={...q,trustLevel:'synthetic',revoked:false};
        if(s.sources[q.id]&&stable(s.sources[q.id])!==stable(value))throw Error('source-id-conflict');s.sources[q.id]=value;}
      for(const e of b.events){exact(e,['id','sourceId','conversationId','messageId','branchId','role','kind','sendState','sentAt','precision','observedAt']);id(e.id);time(e.observedAt);if(e.sentAt!==null&&instant(time(e.sentAt))>instant(e.observedAt))throw Error('future-evidence');
        if(!Object.hasOwn(s.refs,id(e.conversationId))||!Object.hasOwn(s.sources,id(e.sourceId)))throw Error('orphan-event');const value={...e,revoked:false};
        if(s.events[e.id]&&stable(s.events[e.id])!==stable(value))throw Error('evidence-id-conflict');s.events[e.id]=value;}
      for(const cvr of b.coverage){exact(cvr,['id','sourceId','conversationId','from','through','observedAt','completeness','branches','gaps']);id(cvr.id);validateCoverage(cvr);const value={...structuredClone(cvr),revoked:false};
        if(s.coverage[cvr.id]&&stable(s.coverage[cvr.id])!==stable(value))throw Error('coverage-id-conflict');s.coverage[cvr.id]=value;}
      s.channel='synthetic';break;
    }
    case 'REVOKE_SOURCE':{
      if(actor!=='human')throw Error('revocation-denied');exact(c,['type','sourceId']);const q=need(s.sources,c.sourceId);q.revoked=true;break;
    }
    case 'REVOKE_EVIDENCE':{
      if(actor!=='human')throw Error('revocation-denied');exact(c,['type','table','id']);if(!['events','coverage'].includes(c.table))throw Error('invalid-evidence-table');need(s[c.table],c.id).revoked=true;break;
    }
    default:throw Error('unknown-command');
  }
  s.revision=revision;return validateState(s,current.scopeKey);
}
export function changes(before,after){const result=[];for(const table of TABLES)for(const key of new Set([...Object.keys(before[table]),...Object.keys(after[table])])){const a=before[table][key]??null,b=after[table][key]??null;if(stable(a)!==stable(b))result.push({table,key,before:a,after:b});}return result;}
export function undoChanges(current,operation){
  if(operation.invalidatedBy||operation.actor!=='human'||!['CREATE_WORKSPACE','UPDATE_WORKSPACE','SET_TITLE','PLACE','MOVE','SET_PREFERENCE','RESTORE_BACKUP'].includes(operation.type)||operation.undoneBy)throw Error('not-undoable');
  const next=structuredClone(current);
  for(const p of operation.patch){if(!TABLES.includes(p.table)||stable(next[p.table][p.key]??null)!==stable(p.after))throw Error('undo-conflict');if(p.before===null)delete next[p.table][p.key];else next[p.table][p.key]={...p.before,revision:current.revision+1};}
  next.revision=current.revision+1;return validateState(next,current.scopeKey);
}
