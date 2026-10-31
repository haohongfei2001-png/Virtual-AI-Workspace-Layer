/** Synthetic display adapter only. Never native facts, authority or a golden. */
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeFrame} from '../../src/runtime/free-frame-projection.mjs';
export const APPROVED_V27_SHA256='81fa9779e4bc98b6b67c348f72a32ee1fd99519833994af9ed95716126f7da4e';
export function adaptApprovedDaily(input){
 if(input?.state?.scenario!=='daily'||input.state.offset!==0||input.state.today!=='2026-10-10'||!Array.isArray(input.topics)||!Array.isArray(input.chats))throw Error('unsupported-approved-scene');
 const scope='synthetic-approved-daily-component',refs=[],projects=[],unmappable=[
  'Prototype user worksets are represented by synthetic Free project groups; this is layout-only, not semantic/native membership equivalence.',
  'Prototype per-workset icons have no equivalent field in the Free frame DTO; production icons remain unchanged.',
  'Native host/sidebar/composer chrome is excluded from component comparison; full MV3 captures are separate.',
  'Prototype title prefix stripping is applied to synthetic nativeTitle for matching visible labels; no real title is changed.',
  'Component scope includes only prototype current-segment groups; other historical/unknown groups are excluded, not a complete inventory.',
  'Unknown-date children of selected groups remain in production data; if production shows them while prototype hides them this is recorded non-equivalence, not silently filtered.'
 ];
 const topics=new Map(input.topics.map(t=>[t.id,t]));if(topics.size!==input.topics.length)throw Error('duplicate-topic');
 for(const c of input.chats){if(!Array.isArray(c.placements)||c.placements.length!==1||!topics.has(c.placements[0]))throw Error('unmappable-placement');const t=topics.get(c.placements[0]);if(t.bucket!==0)continue;if(c.bucket!==null&&(!Number.isSafeInteger(c.bucket)||c.bucket<0))throw Error('unmappable-bucket');if(typeof c.display!=='string')throw Error('missing-display-title');const prefix=t.name+' ';refs.push({id:c.id,scope,nativeTitle:c.display.startsWith(prefix)?c.display.slice(prefix.length):c.display,nativeUrl:`https://chatgpt.com/c/${encodeURIComponent(c.id)}`,membership:'PROJECT',projectId:t.id,activityDecision:{segment:c.bucket}});}
 if(new Set(refs.map(r=>r.id)).size!==refs.length)throw Error('duplicate-chat');
 for(const t of input.topics){if(t.bucket!==0)continue;if(typeof t.name!=='string'||(t.bucket!==null&&(!Number.isSafeInteger(t.bucket)||t.bucket<0)))throw Error('unmappable-topic');projects.push({id:t.id,scope,nativeName:t.name,members:refs.filter(r=>r.projectId===t.id).map(r=>r.id),activityDecision:{segment:t.bucket}});}
 const snapshot=freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:Math.floor(Date.UTC(2026,9,10)/86400000),Z:'Asia/Shanghai',policyRevision:0},projects,refs});
 return {world:{snapshot},unmappable,counts:{topics:projects.length,refs:refs.length,currentTopics:projects.filter(p=>p.activityDecision.segment===0).length,excludedOtherGroups:input.topics.length-projects.length}};
}
export function approvedDailyProjection(adapted,query={role:'workspace'}){return projectFreeFrame(adapted.world,query);}
