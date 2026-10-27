import {validateFrameRowWindows} from './frame-row-windows.mjs';
/** Presentation/query data only. This codec grants no scope or reading authority. */
const bad=()=>{throw Error('invalid-frame-resume-state');};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function record(value,keys,required=[]){if(!value||Object.getPrototypeOf(value)!==Object.prototype)bad();const own=Reflect.ownKeys(value);if(own.some(k=>!keys.includes(k))||required.some(k=>!own.includes(k)))bad();const copy={};for(const k of own){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value')||!d.enumerable||d.value===undefined)bad();copy[k]=d.value;}return copy;}
function array(value,max){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)bad();const copy=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))bad();copy.push(d.value);}return copy;}
const key=v=>typeof v==='string'&&v.length>=1&&v.length<=512&&!/[\u0000-\u001f\u007f]/.test(v);
function strings(value){const out=array(value,256);if(out.some(v=>!key(v))||new Set(out).size!==out.length)bad();return out;}
function finish(value){if(new TextEncoder().encode(JSON.stringify(value)).length>32768)bad();return value;}
export function validateFrameResumeView(input){const keys=['segment','oldOpen','sidebarOpen','capacities','scroll','sidebarScroll','sidebarVisible'],v=record(input,[...keys,'sidebarChoices','inventoryChoices','sidebarViewport'],keys);if(!integer(v.segment,0,1000000)||!['scroll','sidebarScroll'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=0&&v[k]<=100000000)||typeof v.sidebarVisible!=='boolean')bad();if('sidebarViewport'in v){const n=record(v.sidebarViewport,['owner','scroll'],['owner','scroll']);if(n.owner!=='native-nav'||!integer(n.scroll,0,100000000))bad();v.sidebarViewport=n;}v.oldOpen=strings(v.oldOpen);v.sidebarOpen=strings(v.sidebarOpen);if('sidebarChoices'in v){const chosen=new Set();v.sidebarChoices=array(v.sidebarChoices,256).map(value=>{const pair=array(value,2);if(pair.length!==2||!key(pair[0])||chosen.has(pair[0])||typeof pair[1]!=='boolean')bad();chosen.add(pair[0]);return pair;});}if('inventoryChoices'in v){const owners=new Set();v.inventoryChoices=array(v.inventoryChoices,2).map(value=>{const pair=array(value,2);if(pair.length!==2||!['home','side'].includes(pair[0])||owners.has(pair[0])||typeof pair[1]!=='boolean')bad();owners.add(pair[0]);return pair;});}const seen=new Set();v.capacities=array(v.capacities,256).map(value=>{const pair=array(value,2);if(pair.length!==2||!key(pair[0])||seen.has(pair[0])||!integer(pair[1],1,1000000))bad();seen.add(pair[0]);return pair;});return finish(v);}
export function validateResumeQuery(input){const q=record(input,['segment','offset','limit','groupId','list','rowOffset','rowLimit','rowWindows','search','workingSet']);for(const k of ['segment','offset','rowOffset'])if(k in q&&!integer(q[k],0,1000000))bad();if('limit'in q&&!integer(q.limit,1,24))bad();if('rowLimit'in q&&!(q.rowLimit===200||integer(q.rowLimit,5,197)&&(q.rowLimit-5)%12===0))bad();const group=q.groupId??null,list=q.list??null;if(group!==null&&(typeof group!=='string'||group.length<1||group.length>128)||list!==null&&!['current','old','unknown','noProject'].includes(list)||group!==null&&(!list||list==='noProject')||group===null&&['current','old'].includes(list))bad();if('rowWindows'in q){try{q.rowWindows=validateFrameRowWindows(q.rowWindows);}catch{bad();}}if('search'in q&&'workingSet'in q)bad();for(const kind of ['search','workingSet'])if(kind in q){const search=kind==='search',v=record(q[kind],search?['query','projectId','offset','limit']:['offset','limit'],search?['query']:[]);if(search&&(typeof v.query!=='string'||v.query.length>200||v.projectId!==undefined&&v.projectId!==null&&(typeof v.projectId!=='string'||v.projectId.length<1||v.projectId.length>128)))bad();if('offset'in v&&!integer(v.offset,0,1000000)||'limit'in v&&!integer(v.limit,1,24))bad();q[kind]=v;}return finish(q);}

/** Restore row windows as read intent, never as cached rows or authority. */
export function queryForFrameResume(input,role){
 const view=validateFrameResumeView(input),query={segment:view.segment,offset:0,limit:8},windows=[],seen=new Set();
 for(const [key]of view.capacities)if(key.startsWith('frame-page:'))try{
  const parts=JSON.parse(key.slice(11));if(!Array.isArray(parts)||parts.length!==2)continue;
  const [offset,limit]=parts,page=validateResumeQuery({offset,limit});query.offset=page.offset;query.limit=page.limit;
 }catch{}

 for(const [key,rowLimit]of view.capacities){
  if(!key.startsWith('frame-row:'))continue;
  try{
   const parts=JSON.parse(key.slice(10));if(!Array.isArray(parts)||parts.length!==5)continue;
   const [groupId,list,rowOffset,paged,groupOffset]=parts;
   if(groupId!==null&&groupOffset!==query.offset||![0,1].includes(paged))continue;
   if(groupId!==null&&(role==='sidebar'&&!view.sidebarOpen.includes(groupId)||list==='old'&&!view.oldOpen.includes((role==='sidebar'?'side:':'home:')+groupId)))continue;
   const [window]=validateFrameRowWindows([{groupId,list,rowOffset,rowLimit,...(paged?{paged:true}:{})}]),identity=JSON.stringify([groupId,list]);
   if(seen.has(identity))continue;seen.add(identity);windows.push(window);if(windows.length===74)break;
  }catch{}
 }
 if(windows.length)query.rowWindows=windows;
 return validateResumeQuery(query);
}
