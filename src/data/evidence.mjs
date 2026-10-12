import {finish,finishAsync} from './cooperate.mjs';
import { instant, segmentFor, localDay } from '../navigation/projection.mjs';
/** All evidence here has passed the repository's privileged ingestion boundary. */
export function evidenceTime(refId,state,now){return evidenceRows(refId,state,now,Object.values(state.events));}
function evidenceRows(refId, state, now, events) {
  const clock=instant(now);if(clock===null)throw Error('invalid-clock');
  const times=new Map(), conflicts=new Set(), uncertain=new Set();let unknown=false;
  for(const e of events){
    const source=state.sources[e.sourceId];
    if(e.conversationId!==refId||e.revoked||!source||source.revoked)continue;
    const key=JSON.stringify([e.branchId,e.messageId]),time=instant(e.sentAt);
    if(e.role!=='user'||e.kind!=='new-send'||e.sendState!=='committed'||!['millisecond','second'].includes(e.precision)||time===null||time>clock){unknown=true;uncertain.add(key);continue;}
    if(times.has(key)&&times.get(key)!==time)conflicts.add(key);else times.set(key,time);
  }
  // Exact latest time and a lower-bound positive proof are distinct. An
  // unrelated undated event cannot erase an uncontested current-period send;
  // contradictory observations of the SAME message are never cherry-picked.
  const positives=[...times].filter(([key])=>!conflicts.has(key)&&!uncertain.has(key)).map(([,time])=>time);
  const positiveSentAt=positives.length?new Date(Math.max(...positives)).toISOString():null;
  if(conflicts.size||unknown)return {sentAt:null,status:conflicts.size?'CONFLICT':'UNKNOWN',conflicts:[...conflicts],positiveSentAt,unresolved:true};
  return {sentAt:positiveSentAt,status:positiveSentAt?'KNOWN':'UNKNOWN',conflicts:[],positiveSentAt,unresolved:false};
}
export function coverageThrough(refId,state,from,now){return coverageRows(refId,state,from,now,Object.values(state.coverage));}
function coverageRows(refId,state,from,now,coverage){
  const start=instant(from),end=instant(now);if(start===null||end===null||start>end)return false;
  const intervals=[];
  for(const c of coverage){
    const s=state.sources[c.sourceId];
    if(c.conversationId!==refId||c.revoked||!s||s.revoked||c.completeness!=='complete'||c.branches!=='all')continue;
    const a=instant(c.from),b=instant(c.through),observed=instant(c.observedAt);
    if(a===null||b===null||observed===null||a>b||b>observed||observed>end)continue;
    // Explicit holes are subtracted; other independent complete witnesses may fill them.
    let parts=[[a,b]];
    for(const gap of c.gaps){const g0=instant(gap.from),g1=instant(gap.through);parts=parts.flatMap(([x,y])=>g1<x||g0>y?[[x,y]]:[[x,Math.min(y,g0-1)],[Math.max(x,g1+1),y]].filter(([l,r])=>l<=r));}
    intervals.push(...parts);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let reach=start;
  for(const [a,b] of intervals){if(b<reach)continue;if(a>reach)return false;reach=Math.max(reach,b);if(reach>=end)return true;}
  return false;
}
function* projection(state,now,timeZone){
  localDay(now,timeZone);
  // Fresh per-projection indexes; never cache revoked evidence or scope data across reads.
  const index=function*(rows,key){const map=new Map();let count=0;for(const row of Object.values(rows)){const id=row[key];if(!map.has(id))map.set(id,[]);map.get(id).push(row);if(++count%512===0)yield;}return map;};
  const events=yield*index(state.events,'conversationId'),coverage=yield*index(state.coverage,'conversationId'),placements=yield*index(state.placements,'workspaceId');
  const covered=(refId,from)=>coverageRows(refId,state,from,now,coverage.get(refId)??[]);

  const refs=[];let count=0;for(const r of Object.values(state.refs)){
    const name=state.identities[r.id],time=evidenceRows(r.id,state,now,events.get(r.id)??[]);
    refs.push({...r,scope:state.scopeKey,displayTitle:name?.title??r.nativeTitle,aliases:name?.aliases??[],time});if(++count%512===0)yield;
  }
  const byId=new Map();for(const r of refs){byId.set(r.id,r);if(++count%512===0)yield;}
  const themes=[];for(const w of Object.values(state.workspaces).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))){
    const members=(placements.get(w.id)??[]).filter(p=>!p.excluded).sort((a,b)=>a.order-b.order||a.refId.localeCompare(b.refId)).map(p=>byId.get(p.refId)).filter(Boolean);
    const known=members.map(r=>r.time.sentAt).filter(Boolean).sort(),latest=known.at(-1)??null;
    const positiveCurrent=members.some(r=>r.time.positiveSentAt&&segmentFor(r.time.positiveSentAt,now,timeZone)===0);
    let segment=positiveCurrent?0:latest?segmentFor(latest,now,timeZone):null;
    if(segment!==0&&(!latest||!members.every(r=>!r.time.unresolved&&covered(r.id,latest))))segment=null;
    const current=[],old=[],unknown=[];
    for(const r of members){if(++count%512===0)yield;const own=r.time.positiveSentAt&&segmentFor(r.time.positiveSentAt,now,timeZone)===0?0:r.time.sentAt?segmentFor(r.time.sentAt,now,timeZone):null;
      if(segment===null||own===null)unknown.push(r);
      else if(own===segment)current.push(r);
      else if(own>segment&&covered(r.id,r.time.sentAt))old.push(r);
      else unknown.push(r);
    }
    themes.push({...w,scope:state.scopeKey,members:members.map(r=>r.id),segment,latest,current,old,unknown});yield;
  }
  return {scope:state.scopeKey,revision:state.revision,refs,themes,groups:themes,evidenceLevel:state.channel,ruleVersion:'local-calendar-30-v27'};
}

export function dataProjection(state,now,timeZone){return finish(projection(state,now,timeZone));}
export async function dataProjectionAsync(state,now,timeZone,guard){return finishAsync(projection(state,now,timeZone),guard);}
