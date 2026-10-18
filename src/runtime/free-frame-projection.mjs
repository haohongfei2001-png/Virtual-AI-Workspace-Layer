import {validateFrameRowWindows,frameRowWindowKey} from '../host/frame-row-windows.mjs';
import {validateFreeTimePolicy} from '../data/free-time-policy.mjs';
import {assertPreparedFreeSnapshot} from '../navigation/free-view.mjs';
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const segmentOf=row=>(row.activityDecision??row.activity)?.segment??row.segment??null;
const included=(row,segment)=>segmentOf(row)===segment||(segmentOf(row)===null&&segment===0);
export const freeFrameRowDTO=row=>({id:row.id,available:row.available!==false,freshness:row.freshness??null,nativeTitle:row.nativeTitle??null,displayTitle:row.displayTitle,nativeUrl:row.nativeUrl??null,membership:row.membership,membershipFreshness:row.membershipFreshness??null,projectId:row.projectId??null,segment:segmentOf(row)});
function pageRows(rows,segment,offset,limit,filter){let total=0;const items=[];for(const row of rows){if(filter&&!included(row,segment))continue;if(total>=offset&&items.length<limit)items.push(freeFrameRowDTO(row));total++;}return {items,total,offset,limit,hasMore:offset+items.length<total};}
const countKeys=table=>{let n=0;for(const key in table??{})if(Object.hasOwn(table,key))n++;return n;};
/** Bounded display DTO over the owner's existing prepared ordering. No authority or cursor. */
export function projectFreeFrame(current,query){
 const snapshot=assertPreparedFreeSnapshot(current?.snapshot);
 const keys=['role','segment','offset','limit','groupId','list','rowOffset','rowLimit','rowWindows'];
 if(!query||Object.getPrototypeOf(query)!==Object.prototype||Reflect.ownKeys(query).some(k=>!keys.includes(k))||!['workspace','sidebar'].includes(query.role))throw Error('invalid-free-frame-query');
 const {role,segment=0,offset=0,limit=24,groupId=null,list=null,rowOffset=0,rowLimit=5}=query;
 if(!integer(segment,1000000)||!integer(offset,1000000)||!integer(limit,24)||limit===0||!integer(rowOffset,1000000)||!integer(rowLimit,200)||!(rowLimit===200||rowLimit>=5&&(rowLimit-5)%12===0)||groupId!==null&&(typeof groupId!=='string'||groupId.length<1||groupId.length>128)||list!==null&&!['current','old','unknown','noProject'].includes(list)||groupId!==null&&(!list||list==='noProject')||groupId===null&&['current','old'].includes(list))throw Error('invalid-free-frame-query');
 const rowWindows=validateFrameRowWindows(query.rowWindows??[]),windows=new Map(rowWindows.map(w=>[frameRowWindowKey(w),w]));
 const windowPage=(rows,groupId,list,filter)=>{const w=query.list===list&&(query.groupId??null)===groupId?null:windows.get(frameRowWindowKey({groupId,list})),p=pageRows(rows,segment,w?.rowOffset??0,w?.rowLimit??5,filter);return w?.paged?{...p,paged:true}:p;};
 const groups=[];let total=0;for(const group of snapshot.groups){if(!included(group,segment))continue;if(total>=offset&&groups.length<limit)groups.push({id:group.id,nativeName:group.nativeName??null,name:group.name,freshness:group.freshness??null,nativeUrl:group.nativeUrl??null,segment:segmentOf(group),memberCount:group.members.length,lists:Object.fromEntries(['current','old','unknown'].map(kind=>[kind,windowPage(group[kind],group.id,kind,false)]))});total++;}
 const entries={};for(const kind of ['noProject','unknown']){const rows=snapshot[kind]??[],page=windowPage(rows,null,kind,true);entries[kind]={...page,inventoryTotal:rows.length};}
 let selection=null;
 if(list!==null){let rows;if(groupId!==null){const group=snapshot.groups.find(g=>g.id===groupId);if(!group||!included(group,segment))throw Error('free-frame-group-unavailable');rows=group[list];}else rows=snapshot[list]??[];const w=windows.get(frameRowWindowKey({groupId,list}));selection={groupId,list,...pageRows(rows,segment,rowOffset,rowLimit,groupId===null),...(w?.paged&&w.rowOffset===rowOffset&&w.rowLimit===rowLimit?{paged:true}:{})};}
 let maxSegment=0;for(const rows of [snapshot.groups,snapshot.refs])for(const row of rows){const value=segmentOf(row);if(Number.isSafeInteger(value)&&value>=0)maxSegment=Math.max(maxSegment,value);}
 const v=snapshot.viewSession,policy=snapshot.preferences?.freeTimePolicy?.value;
 if(policy)validateFreeTimePolicy(policy);
 const result={protocol:'vaiwl-free-frame/1',role,scope:snapshot.scope,revision:snapshot.revision,workspaceRevision:snapshot.workspaceRevision,evidenceRevision:snapshot.evidenceRevision,viewRevision:snapshot.viewRevision,viewSession:v?{H:v.H,T:v.T,Z:v.Z,policyRevision:v.policyRevision}:null,segment,
  timePolicy:policy?{mode:policy.mode,H:policy.H,revision:policy.revision}:{mode:'fixed',H:v?.H??30,revision:v?.policyRevision??0},
  navigation:{hasNewer:segment>0,hasOlder:segment<maxSegment,maxSegment},
  groups:{items:groups,total,offset,limit,hasMore:offset+groups.length<total},entries,selection,
  inventory:{projects:snapshot.groups.length,refs:snapshot.refs.length,omittedProjects:snapshot.manifest?.projectVersions?Math.max(0,countKeys(snapshot.manifest.projectVersions)-snapshot.groups.length):null,omittedRefs:snapshot.manifest?.refVersions?Math.max(0,countKeys(snapshot.manifest.refVersions)-snapshot.refs.length):null,complete:snapshot.inventoryComplete===true},completeSnapshot:false};
 if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('free-frame-page-too-large');return result;
}
