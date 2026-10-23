import { instant, localDay } from '../navigation/projection.mjs';
import { freeSegmentFor } from './free-time-policy.mjs';
import { validateObservedSendAnchor } from './observed-send-anchor.mjs';
function active(row,sources,clock) {
  const source=sources[row.sourceId],durableNative=source?.channel==='host-evidence'&&source.codecVersion===3&&['native-activity','native-order','local-recent-use'].includes(row.hintType);
  return !!source&&!source.revoked&&!row.revoked&&
    (durableNative||source.channel==='host-evidence'&&source.codecVersion===2&&row.kind==='new-send'||source.validUntil===undefined||instant(source.validUntil)>clock)&&
    (durableNative||row.validUntil===undefined||instant(row.validUntil)>clock)&&
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
    const seen=new Map(),bad=new Set(),originalConflicts=new Set();
    for(const e of events.get(id)??[]){
      if(!active(e,sources,clock)||e.actorVerified!==true||e.actorScopeKey!==snapshot.scope||e.role!=='user'||e.kind!=='new-send'||e.sendState!=='committed'||!e.messageId||!e.branchId)continue;
      const key=JSON.stringify(sources[e.sourceId]?.channel==='host-evidence'&&sources[e.sourceId]?.codecVersion===2?['host-original',e.conversationId,e.messageId]:[e.branchId,e.messageId]),r=interval(e);
      if(!r||instant(r[1])>clock||instant(r[1])>instant(e.observedAt)){bad.add(key);continue;}
      if(seen.has(key)&&JSON.stringify(seen.get(key))!==JSON.stringify(r)){bad.add(key);if(sources[e.sourceId]?.channel==='host-evidence'&&sources[e.sourceId]?.codecVersion===2)originalConflicts.add(key);}else seen.set(key,r);
    }
    const positives=[...seen].filter(([key])=>!bad.has(key)).map(([,r])=>r).sort((a,b)=>instant(b[1])-instant(a[1]));
    const latest=positives[0];let result=base,nativeOrder=null,localUse=null;
    if(latest){
      const lo=freeSegmentFor(latest[0],session),hi=freeSegmentFor(latest[1],session),same=lo===hi&&lo!==null;
      const complete=!bad.size&&covered(coverage.get(id)??[],latest[1],now,sources,clock);
      result={...base,basis:same&&(hi===0||complete)?(latest[0]===latest[1]?'exact':'interval'):'provisional',candidateDay:localDay(latest[1],session.Z),candidateTime:latest[1],segment:hi,
        reason:!same?'interval-crosses-window':hi===0?'positive-send':complete?'covered-history':'historical-anchor-incomplete',sentInterval:{from:latest[0],through:latest[1]}};
    }
    for(const h of hints.get(id)??[]){
      if(h.hintType==='local-recent-use'){
        if(active(h,sources,clock)&&sources[h.sourceId]?.codecVersion===3&&instant(h.usedAt)!==null&&instant(h.usedAt)<=clock&&instant(h.usedAt)<=instant(h.observedAt)&&(!localUse||instant(localUse.usedAt)<instant(h.usedAt)))localUse={usedAt:h.usedAt,sourceId:h.sourceId};
        continue;
      }
      if(h.hintType==='native-order'){
        const src=sources[h.sourceId];
        if(active(h,sources,clock)&&src?.codecVersion===3&&h.orderBatch===src.orderBatch&&h.orderDomain===src.orderDomain)nativeOrder={sourceId:h.sourceId,domain:h.orderDomain,batch:h.orderBatch,rank:h.rank};
        continue;
      }
      if(h.hintType==='observed-self-send'){
        // A validated, uncontested original-send event for this exact message
        // supersedes its observation estimate even when the ACK arrived later.
        // Conflicting valid originals quarantine this same message, including its estimate.
        const originalKey=JSON.stringify(['host-original',h.conversationId,h.messageId]);
        if(seen.has(originalKey)&&!bad.has(originalKey)||originalConflicts.has(originalKey))continue;
        // A bounded local observation remains an estimate, not a server send
        // timestamp. Calibration due/ordinary source TTL never erase its fixed
        // first-observation anchor; explicit revocation still does.
        const source=sources[h.sourceId];
        try{validateObservedSendAnchor(h,{scopeKey:snapshot.scope,sources});}catch{continue;}
        if(!source||source.id!==h.sourceId||source.channel!=='host-evidence'||source.codecVersion!==1||source.revoked!==false||h.revoked||h.generation!==source.generation||!Number.isSafeInteger(source.sourceRevision)||source.sourceRevision<1||h.sourceRevision>source.sourceRevision||instant(source.observedAt)===null||instant(source.validUntil)===null||instant(source.validUntil)<=instant(source.observedAt)||instant(h.observedAt)>instant(source.observedAt)||instant(h.observedAt)>clock||instant(h.firstObservedAt)>clock)continue;
        const at=h.candidateInterval.through;if(instant(at)>clock||result.candidateTime!==null&&instant(at)<=instant(result.candidateTime))continue;
        result={...base,basis:'provisional',candidateDay:localDay(at,session.Z),candidateTime:at,segment:freeSegmentFor(at,session),reason:'observed-self-send',nextCheck:h.calibrationDueAt,validUntil:null};
        continue;
      }
      if(!active(h,sources,clock)||!h.eventKey||instant(h.validUntil)===null)continue;
      const self=h.hintType==='local-confirmed-send'&&h.actorVerified===true&&h.actorScopeKey===snapshot.scope;
      if(!self&&!(h.hintType==='native-activity'&&h.semanticsVerified===true))continue;
      const r=interval(h),at=r?.[1]??(self?h.observedAt:null);
      if(!at||instant(at)>clock||instant(at)>instant(h.observedAt))continue;
      const candidateDay=localDay(at,session.Z);
      if(result.candidateTime!==null&&instant(at)<=instant(result.candidateTime))continue;
      result={...base,basis:'provisional',candidateDay,candidateTime:at,segment:freeSegmentFor(at,session),reason:self?'confirmed-send-observation':'native-activity-hint',validUntil:sources[h.sourceId]?.codecVersion===3?null:h.validUntil,nextCheck:h.validUntil};
    }
    // Local interaction is independent from server activity and strict send
    // evidence. It can prioritize a verified opened item, never assert an ACK.
    if(localUse){
      if(result.candidateTime===null||instant(localUse.usedAt)>instant(result.candidateTime))result={...base,basis:'provisional',candidateDay:localDay(localUse.usedAt,session.Z),candidateTime:localUse.usedAt,segment:freeSegmentFor(localUse.usedAt,session),reason:'local-recent-use'};
      result={...result,localUse};
    }
    if(bad.size&&result.basis==='undated')result={...result,reason:'conflicting-send-evidence'};
    return nativeOrder?{...result,nativeOrder,reason:result.basis==='undated'?'native-relative-order':result.reason}:result;
  };
  const refs=snapshot.refs.map(r=>{if(r.scope!==snapshot.scope)throw Error('cross-scope-free-ref');const activityDecision=decision(r.id);return {...r,activityDecision,activity:activityDecision};});
  return aggregateFreeActivity({...snapshot,refs,viewSession:session});
}
/** Aggregate already verified row decisions without trusting page-level send labels. */
export function aggregateFreeActivity(snapshot) {
  const refs=snapshot.refs;
  for(const row of refs)if(row.scope!==snapshot.scope||!row.activityDecision)throw Error('invalid-free-row-decision');
  const emptyDecision=id=>({objectKey:id,evidenceRevision:snapshot.evidenceRevision??refs[0]?.activityDecision.evidenceRevision??0,basis:'undated',candidateDay:null,candidateTime:null,segment:null,reason:'no-valid-activity',nextCheck:null,validUntil:null});
  const byId=new Map(refs.map(r=>[r.id,r]));
  // ISO validation/parsing is O(rows), not O(sort comparisons). This cache lives
  // for exactly one projection, so expiry, scope and evidence changes cannot reuse it.
  const sortKeys=new Map(),timeCache=new Map();
  // Exact input keys preserve strict instant validation. Stop adding at the cap
  // so unique timestamps cannot cause eviction churn or unbounded memory use.
  const cachedInstant=value=>{
    if(typeof value!=='string')return instant(value);
    if(timeCache.has(value))return timeCache.get(value);
    const parsed=instant(value);if(timeCache.size<256)timeCache.set(value,parsed);
    return parsed;
  };
  const rememberKey=row=>{const d=row.activityDecision;sortKeys.set(row,[Number(d.candidateDay===null),cachedInstant(d.candidateTime)??0]);};
  for(const row of refs)rememberKey(row);
  // Returning zero preserves the native input order for equal or undated activity.
  const order=(a,b)=>{const x=sortKeys.get(a),y=sortKeys.get(b);return x[0]-y[0]||y[1]-x[1];};
  const sortActivity=rows=>{
    rows.sort(order);
    // Reorder only comparable equal-time slots. Cross-domain zero comparisons
    // inside Array.sort would make its comparator non-transitive.
    const groups=new Map();rows.forEach((r,i)=>{const n=r.activityDecision.nativeOrder;if(!n)return;const key=JSON.stringify([...sortKeys.get(r),n.sourceId,n.domain,n.batch]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
    for(const slots of groups.values()){const ranked=slots.map(i=>rows[i]).sort((a,b)=>a.activityDecision.nativeOrder.rank-b.activityDecision.nativeOrder.rank);slots.forEach((slot,i)=>rows[slot]=ranked[i]);}return rows;
  };
  const resolve=rows=>sortActivity(rows.map(r=>byId.get(typeof r==='string'?r:r.id)).filter(Boolean));
  const projects=snapshot.projects.map(p=>{
    if(p.scope!==snapshot.scope)throw Error('cross-scope-free-project');
    const members=resolve(p.members),dated=members.filter(r=>r.activityDecision.candidateDay!==null),latest=dated[0]?.activityDecision;
    let activityDecision=latest?{...latest,objectKey:p.key??p.id}:{...emptyDecision(p.id),objectKey:p.key??p.id};
    // Empty Projects and inventory discovery do not constitute sends. Unknown members cannot erase a positive recent send.
    if(!latest){
      const ranked=members.map(r=>r.activityDecision.nativeOrder).filter(Boolean),domains=new Set(ranked.map(n=>JSON.stringify([n.sourceId,n.domain,n.batch])));
      const nativeOrder=domains.size===1?ranked.reduce((best,n)=>!best||n.rank<best.rank?n:best,null):null;
      activityDecision={...activityDecision,...(nativeOrder?{nativeOrder}:{}),basis:'undated',candidateDay:null,candidateTime:null,segment:null,reason:nativeOrder?'native-relative-order':'no-member-activity'};
    }
    else if(latest.segment!==0&&(p.membershipComplete!==true||members.some(r=>!['exact','interval'].includes(r.activityDecision.basis))))activityDecision={...activityDecision,basis:'provisional',reason:'incomplete-member-activity'};
    const segment=activityDecision.segment;
    const card={...p,members,activityDecision,activity:activityDecision,segment,
      current:members.filter(r=>r.activityDecision.segment===segment&&segment!==null),
      old:members.filter(r=>segment!==null&&r.activityDecision.segment!==null&&r.activityDecision.segment>segment),
      unknown:members.filter(r=>r.activityDecision.segment===null)};
    rememberKey(card);return card;
  });
  sortActivity(projects);
  return {...snapshot,refs,projects,noProject:resolve(snapshot.noProject),unknown:resolve(snapshot.unknown)};
}
/** A duplicate poll of an event cannot renew its observation anchor or expiration. */
export function mergeFreeObservationHints(existing,incoming) {
  const result=structuredClone(existing??{}),keys=new Set(Object.values(result).map(h=>JSON.stringify([h.sourceId,h.eventKey])));
  for(const h of incoming){const key=JSON.stringify([h.sourceId,h.eventKey]);if(keys.has(key))continue;if(!h.id||Object.hasOwn(result,h.id))throw Error('hint-id-conflict');result[h.id]=structuredClone(h);keys.add(key);}
  return result;
}
