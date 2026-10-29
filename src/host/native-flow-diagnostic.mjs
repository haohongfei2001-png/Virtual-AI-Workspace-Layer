// Serializes the first existing preflight decision; it never observes, retries,
// changes admission, or reads native strings. Enabled only by an explicit
// diagnostic build, and consumed once by the current home document session.
export const nativeFlowFailureReasons=Object.freeze(['inspection','regions','root','header','capacity','wrapper-control','wrapper-text','wrapper-paint','uncovered-branch','branch-paint','branch-order','protected-controls','geometry','check-failed'].map(reason=>'native-flow-'+reason));
const phases=['inspection','regions','root','header','walk','retained-paint','retained-identity','order','controls','geometry','complete','exception'];
const details=['inspection','invalid-regions','root-unavailable','root-unsupported','header-overlap','leaf-uncovered','branch-without-landmark','empty-wrapper','wrapper-control','wrapper-text','wrapper-visibility','wrapper-effect','wrapper-pseudo','node-capacity','detached','retained-box','retained-budget','retained-text-overflow','retained-opaque','retained-svg','retained-style','retained-pseudo','retained-svg-paint','retained-svg-viewport','retained-box-overflow','retained-outline','retained-final-budget','order','protected-controls','geometry','exception','accepted'];
const tags=['DIV','MAIN','SECTION','HEADER','FOOTER','NAV','FORM','H1','H2','H3','P','SPAN','A','BUTTON','INPUT','TEXTAREA','SELECT','UL','OL','LI','SVG','G','PATH','RECT','CIRCLE','ELLIPSE','LINE','POLYLINE','POLYGON','TITLE','DESC','STYLE','SCRIPT','TEMPLATE','IFRAME','CANVAS','VIDEO','AUDIO','OBJECT','EMBED','TEXT','OTHER'];
const roles=['absent','main','navigation','region','group','list','listitem','button','link','textbox','tab','tablist','tabpanel','dialog','alert','status','none','presentation','other'];
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.getOwnPropertyDescriptor(v,k)?.get===undefined&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value'));
const array=(v,max)=>Array.isArray(v)&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const optionalIndex=(n,length)=>n===null||integer(n,0,length-1);
export const MAIN_MOUNT_DIAGNOSTIC_BATCH='vaiwl-main-mount-check-20261029-v1';
const isHome=url=>{try{const u=new URL(url);return u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}};
/** Reserve before capture, once across tabs/reloads. Only this fixed spent bit
 * is persisted, never a report or a document/account identifier. Failures and
 * lost replies consume or deny the attempt; they never retry or block Host. */
export async function claimMainMountDiagnostic({storage,locks,url,currentURL=()=>url,schedule=setTimeout,cancel=clearTimeout}){
 if(!isHome(url)||!storage?.get||!storage?.set||!locks?.request)return false;
 let active=true,timer;
 try{return await Promise.race([locks.request(MAIN_MOUNT_DIAGNOSTIC_BATCH,{ifAvailable:true},async lock=>{
  if(!lock||!active||currentURL()!==url)return false;
  const old=(await storage.get(MAIN_MOUNT_DIAGNOSTIC_BATCH))[MAIN_MOUNT_DIAGNOSTIC_BATCH];
  if(!active||old!==undefined||currentURL()!==url)return false;
  await storage.set({[MAIN_MOUNT_DIAGNOSTIC_BATCH]:{spent:true}});
  return active&&currentURL()===url;
 }),new Promise(resolve=>{timer=schedule(()=>{active=false;resolve(false);},1000);})]);}catch{return false;}finally{active=false;cancel(timer);}
}

/** One already reserved attempt in one content document and one live Host
 * generation. Status reads return a copy, without DOM reads or recapture. */
export function createMainMountDiagnosticSlot({document:doc,enabled=false}){
 const url=doc.location.href;let spent=false,saved=null,owner=null;
 const current=()=>enabled&&isHome(url)&&doc.location.href===url;
 return Object.freeze({
  take(isCurrent){if(spent||!current()||!isCurrent())return null;spent=true;owner=isCurrent;return report=>{if(current()&&owner()&&validMainMountCheck(report))saved=structuredClone(report);};},
  read(){return saved&&current()&&owner?.()?structuredClone(saved):null;}
 });
}
export function validMainMountCheck(v){
 try{
  if(!exact(v,['schema','outcome','reason','kind','phase','detail','visited','coverage','limit','elapsedMs','root','rejected','landmarks','rows'])||v.schema!=='main-mount-check-v1'||!['refused','accepted'].includes(v.outcome)||!(v.outcome==='accepted'?v.reason==='none'&&v.phase==='complete'&&v.detail==='accepted':nativeFlowFailureReasons.includes(v.reason)&&v.phase!=='complete'&&v.detail!=='accepted')||!['unknown','home','project','conversation'].includes(v.kind)||!phases.includes(v.phase)||!details.includes(v.detail)||!integer(v.visited,0,129)||!['complete','partial'].includes(v.coverage)||!['none','rows','depth','time','unavailable'].includes(v.limit)||(v.coverage==='complete')!==(v.limit==='none')||!integer(v.elapsedMs,0,6000)||!array(v.rows,24)||!array(v.landmarks,3))return false;
  if(v.landmarks.length!==3||![v.root,v.rejected,...v.landmarks].every(n=>optionalIndex(n,v.rows.length)))return false;
  if(!v.rows.every((r,i)=>array(r,6)&&r.length===6&&integer(r[0],-1,i-1)&&(r[1]===null||integer(r[1],0,127))&&tags.includes(r[2])&&roles.includes(r[3])&&integer(r[4],0,127)&&(r[5]===null||array(r[5],4)&&r[5].length===4&&r[5].every((n,j)=>integer(n,j<2?-65536:0,65536)))))return false;
  if(v.rejected!==null&&!(v.rows[v.rejected][4]&64)||v.root!==null&&!(v.rows[v.root][4]&2)||v.phase==='exception'&&(v.rejected!==null||v.coverage!=='partial'))return false;
  return v.coverage!=='complete'||v.outcome==='accepted'||v.rejected!==null;
 }catch{return false;}
}

/** At most the rejected ancestor path and the three already identified native
 * landmarks. No descendants or siblings are scanned for their contents.
 * Row: [parent index, childNodes ordinal, fixed tag, fixed role, bits, rect].
 * Bits: connected=1, root=2, reading=4, composer=8, header=16,
 * protected=32, rejected=64. Indices live only in this report.
 */
export function snapshotMainMountCheck({document:doc,reason,kind='unknown',phase='inspection',detail='inspection',node=null,root=null,inspection,visited=0,elapsedNow=()=>doc.defaultView.performance.now()}){
 const started=elapsedNow(),rows=[],nodes=[],landmarks=[inspection?.reading,inspection?.composer,inspection?.header];
 let limit='none';const mark=value=>{if(limit==='none')limit=value;};
 const within=()=>{const delta=elapsedNow()-started;if(!Number.isFinite(delta)||delta<0||delta>=8){mark('time');return false;}return true;};
 const add=(n)=>{
  if(!n)return null;
  const existing=nodes.indexOf(n);if(existing>=0)return existing;
  if(!within())return null;
  if(nodes.length>=24){mark('rows');return null;}
  const parent=nodes.indexOf(n.parentNode);let ordinal=null;
  if(n.parentNode){const siblings=n.parentNode.childNodes;for(let i=0;i<Math.min(siblings.length,128);i++){if(!within())return null;if(siblings[i]===n){ordinal=i;break;}}if(ordinal===null)mark('rows');}
  const rawTag=n.nodeType===3?'TEXT':n.tagName?.toUpperCase(),tag=tags.includes(rawTag)?rawTag:'OTHER';
  const rawRole=n.nodeType===1?n.getAttribute('role'):null,role=rawRole===null?'absent':roles.includes(rawRole)?rawRole:'other';
  const bits=(n.isConnected&&n.ownerDocument===doc?1:0)|(n===root?2:0)|(n===landmarks[0]?4:0)|(n===landmarks[1]?8:0)|(n===landmarks[2]?16:0)|(inspection?.protectedRegions?.includes(n)?32:0)|(n===node?64:0);
  let box=null;if(n.nodeType===1){const r=n.getBoundingClientRect(),values=[r.x,r.y,r.width,r.height];if(values.every((v,i)=>Number.isFinite(v)&&Math.abs(v)<=65536&&(i<2||v>=0)))box=values.map(Math.round);else mark('unavailable');}
  if(!within())return null;
  nodes.push(n);rows.push([parent,ordinal,tag,role,bits,box]);return nodes.length-1;
 };
 try{
  if(reason!=='none'){
   const path=[];let cursor=node;
   while(cursor&&cursor!==root&&path.length<16&&within()){path.push(cursor);cursor=cursor.parentNode;}
   if(cursor===root&&root)path.push(root);else if(cursor)mark('depth');else mark('unavailable');
   if(root&&!path.includes(root))add(root);
   for(const n of path.reverse())add(n);
   for(const n of landmarks)add(n);
  }
 }catch{mark('unavailable');}
 const index=n=>{const i=nodes.indexOf(n);return i<0?null:i;};
 if(reason!=='none'&&index(node)===null)mark('unavailable');
 within();const elapsed=elapsedNow()-started;
 const result={schema:'main-mount-check-v1',outcome:reason==='none'?'accepted':'refused',reason,kind,phase,detail,visited:Math.min(129,Math.max(0,visited)),coverage:limit==='none'?'complete':'partial',limit,elapsedMs:Number.isFinite(elapsed)?Math.min(6000,Math.max(0,Math.ceil(elapsed))):6000,root:index(root),rejected:index(node),landmarks:landmarks.map(index),rows};
 return validMainMountCheck(result)?result:null;
}
