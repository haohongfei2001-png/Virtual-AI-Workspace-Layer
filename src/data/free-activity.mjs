import { instant, localDay } from '../navigation/projection.mjs';
import { freeSegmentFor } from './free-time-policy.mjs';
function active(row,sources,clock) {
  const source=sources[row.sourceId];
  return !!source&&!source.revoked&&!row.revoked&&
    (source.validUntil===undefined||instant(source.validUntil)>clock)&&
    (row.validUntil===undefined||instant(row.validUntil)>clock)&&
    (row.generation===undefined||row.generation===source.generation)&&
    (row.sourceRevision===undefined||row.sourceRevision<=source.sourceRevision)&&
    instant(row.observedAt)!==null&&instant(row.observedAt)<=clock;
}
function interval(row) {
  if(['second','millisecond'].includes(row.precision)&&instant(row.sentAt)!==null)return [row.sentAt,row.sentAt];
  const r=row.candidateInterval??row.sentInterval;
  return r&&instant(r.from)!==null&&instant(r.through)!==null&&instant(r.from)<=instant(r.through)?[r.from,r.through]:null;
}
function covered(rows,from,now,sources,clock) {
  const parts=[];
  for(const c of rows){
    if(!active(c,sources,clock)||c.completeness!=='complete'||c.branches!=='all')continue;
    const a=instant(c.from),b=instant(c.through);
    if(a===null||b===null||a>b||b>instant(c.observedAt))continue;
    let spans=[[a,b]];
    for(const g of c.gaps??[]){const l=instant(g.from),r=instant(g.through);if(l===null||r===null||l>r){spans=[];break;}spans=spans.flatMap(([x,y])=>r<x||l>y?[[x,y]]:[[x,Math.min(y,l-1)],[Math.max(x,r+1),y]].filter(([x,y])=>x<=y));}
    parts.push(...spans);
  }
  parts.sort((a,b)=>a[0]-b[0]);let reach=instant(from);
  for(const [a,b] of parts){if(a>reach)return false;reach=Math.max(reach,b);if(reach>=instant(now))return true;}
  return false;
}
const index=(rows,key)=>{const m=new Map();for(const r of Object.values(rows??{})){if(!m.has(r[key]))m.set(r[key],[]);m.get(r[key]).push(r);}return m;};
/** All inputs belong to a privileged, scope-checked ingestion path. No evidence is mutated. */
export function projectFreeActivity(snapshot,evidence,session,now) {
  if(!snapshot?.scope||evidence.scopeKey!==snapshot.scope)throw Error('cross-scope-free-activity');
  const clock=instant(now);if(clock===null)throw Error('invalid-clock');
  const sources=evidence.sources??{},events=index(evidence.events,'conversationId'),hints=index(evidence.hints,'conversationId'),coverage=index(evidence.coverage,'conversationId');
  const decision=(id)=>{
    const base={objectKey:id,evidenceRevision:evidence.evidenceRevision??0,basis:'undated',candidateDay:null,candidateTime:null,segment:null,reason:'no-valid-activity',nextCheck:null,validUntil:null};
    const seen=new Map(),bad=new Set();
    for(const e of events.get(id)??[]){
      if(!active(e,sources,clock)||e.actorVerified!==true||e.actorScopeKey!==snapshot.scope||e.role!=='user'||e.kind!=='new-send'||e.sendState!=='committed'||!e.messageId||!e.branchId)continue;
      const key=JSON.stringify([e.branchId,e.messageId]),r=interval(e);
      if(!r||instant(r[1])>clock||instant(r[1])>instant(e.observedAt)){bad.add(key);continue;}
      if(seen.has(key)&&JSON.stringify(seen.get(key))!==JSON.stringify(r))bad.add(key);else seen.set(key,r);
    }
    const positives=[...seen].filter(([key])=>!bad.has(key)).map(([,r])=>r).sort((a,b)=>instant(b[1])-instant(a[1]));
    const latest=positives[0];let result=base;
    if(latest){
      const lo=freeSegmentFor(latest[0],session),hi=freeSegmentFor(latest[1],session),same=lo===hi&&lo!==null;
      const complete=!bad.size&&covered(coverage.get(id)??[],latest[1],now,sources,clock);
      result={...base,basis:same&&(hi===0||complete)?(latest[0]===latest[1]?'exact':'interval'):'provisional',candidateDay:localDay(latest[1],session.Z),candidateTime:latest[1],segment:hi,
        reason:!same?'interval-crosses-window':hi===0?'positive-send':complete?'covered-history':'historical-anchor-incomplete',sentInterval:{from:latest[0],through:latest[1]}};
    }
    for(const h of hints.get(id)??[]){
      if(!active(h,sources,clock)||!h.eventKey||instant(h.validUntil)===null)continue;
      const self=h.hintType==='local-confirmed-send'&&h.actorVerified===true&&h.actorScopeKey===snapshot.scope;
      if(!self&&!(h.hintType==='native-activity'&&h.semanticsVerified===true))continue;
      const r=interval(h),at=r?.[1]??(self?h.observedAt:null);
      if(!at||instant(at)>clock||instant(at)>instant(h.observedAt))continue;
      const candidateDay=localDay(at,session.Z);
      if(result.candidateTime!==null&&instant(at)<=instant(result.candidateTime))continue;
      result={...base,basis:'provisional',candidateDay,candidateTime:at,segment:freeSegmentFor(at,session),reason:self?'confirmed-send-observation':'native-activity-hint',validUntil:h.validUntil,nextCheck:h.validUntil};
    }
    if(bad.size&&result.basis==='undated')result={...result,reason:'conflicting-send-evidence'};
    return result;
  };
  const refs=snapshot.refs.map(r=>{if(r.scope!==snapshot.scope)throw Error('cross-scope-free-ref');const activityDecision=decision(r.id);return {...r,activityDecision,activity:activityDecision};});
  const byId=new Map(refs.map(r=>[r.id,r]));
  const order=(a,b)=>(a.activityDecision.candidateDay===null)-(b.activityDecision.candidateDay===null)||(instant(b.activityDecision.candidateTime)??0)-(instant(a.activityDecision.candidateTime)??0);
  const resolve=rows=>rows.map(r=>byId.get(typeof r==='string'?r:r.id)).filter(Boolean).sort(order);
  const projects=snapshot.projects.map(p=>{
    if(p.scope!==snapshot.scope)throw Error('cross-scope-free-project');
    const members=resolve(p.members),dated=members.filter(r=>r.activityDecision.candidateDay!==null),latest=dated[0]?.activityDecision;
    let activityDecision=latest?{...latest,objectKey:p.key??p.id}:{...decision(p.id),objectKey:p.key??p.id};
    // Empty Projects and inventory discovery do not constitute sends. Unknown members cannot erase a positive recent send.
    if(!latest)activityDecision={...activityDecision,basis:'undated',candidateDay:null,candidateTime:null,segment:null,reason:'no-member-activity'};
    else if(latest.segment!==0&&(p.membershipComplete!==true||members.some(r=>!['exact','interval'].includes(r.activityDecision.basis))))activityDecision={...activityDecision,basis:'provisional',reason:'incomplete-member-activity'};
    const segment=activityDecision.segment;
    return {...p,members,activityDecision,activity:activityDecision,segment,
      current:members.filter(r=>r.activityDecision.segment===segment&&segment!==null),
      old:members.filter(r=>segment!==null&&r.activityDecision.segment!==null&&r.activityDecision.segment>segment),
      unknown:members.filter(r=>r.activityDecision.segment===null)};
  }).sort(order);
  return {...snapshot,refs,projects,noProject:resolve(snapshot.noProject),unknown:resolve(snapshot.unknown),viewSession:session};
}
/** A duplicate poll of an event cannot renew its observation anchor or expiration. */
export function mergeFreeObservationHints(existing,incoming) {
  const result=structuredClone(existing??{}),keys=new Set(Object.values(result).map(h=>JSON.stringify([h.sourceId,h.eventKey])));
  for(const h of incoming){const key=JSON.stringify([h.sourceId,h.eventKey]);if(keys.has(key))continue;if(!h.id||Object.hasOwn(result,h.id))throw Error('hint-id-conflict');result[h.id]=structuredClone(h);keys.add(key);}
  return result;
}
