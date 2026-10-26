/** UI-06 subcase in the original packaged J3 document. Test-only, no fixture or
 * business-state injection. Raw AX names/values and DOM IDs never enter reports. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
export const UI06_LIMITS=Object.freeze({keys:64,deadlineMs:15000});
const sentinel='Offline prefix uniquely selected fixture words suffix.';
const historySelector='aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]';
const targets=['reading','history','historyOther','composer','workspace','sidebar'];
const focusKinds=['composer','history','history-other','native-background','protected-native','native-other','workspace','sidebar','owned-control','owned-other','owned-return','none'];
const exact=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'UI06 unexpected observation fields');
const count=(n,max=100000)=>assert(Number.isSafeInteger(n)&&n>=0&&n<=max,'UI06 invalid observation count');
// One monotonic absolute deadline per phase, shared by every await. Timers reject
// hung protocol calls; checking again after resolution rejects synchronous lateness.
export function createUI06Deadline({now=()=>performance.now(),limit=UI06_LIMITS.deadlineMs}={}){
 const start=now();let last=start;assert(Number.isFinite(start));
 const remaining=()=>{const current=now();assert(Number.isFinite(current)&&current>=last,'UI06 monotonic clock regressed');last=current;assert(current-start<limit,'UI06 phase deadline');return limit-(current-start);};
 return {elapsed:()=>Math.min(limit+1,Math.max(0,Math.ceil(last-start))),async run(operation){const left=remaining();let timer;try{const result=await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UI06 phase deadline')),left);})]);remaining();return result;}finally{clearTimeout(timer);}}};
}
// Cross-process documents cannot be sampled in a single JavaScript task.
// Retain every cumulative observation; never reset events or send another key
// while waiting for two equal full rounds within the caller's phase deadline.
export async function readUI06StableDocuments({readRound,deadline,trace,maxRounds=8}){
 assert(Number.isSafeInteger(maxRounds)&&maxRounds>=2&&maxRounds<=8,'UI06 invalid snapshot bound');
 assert(Array.isArray(trace));let prior;
 for(let round=0;round<maxRounds;round++){
  const current=await deadline.run(readRound);trace.push(structuredClone(current));
  if(prior&&isDeepStrictEqual(prior,current))return current;
  prior=structuredClone(current);
 }
 throw Error('UI06 unstable focus observation');
}
// Renderer updates are asynchronous. Both real expanded states must settle
// under the same seed deadline before keyboard provenance starts.
export async function seedUI06Settings(frame,deadline){
 const step=operation=>deadline.run(operation),settings=frame.getByRole('button',{name:'工作空间设置',exact:true});
 assert.equal(await step(()=>settings.getAttribute('aria-expanded')),'false');
 for(const expanded of ['true','false']){await step(()=>settings.click());await step(()=>frame.locator(`[data-focus-key="workspace-settings"][aria-expanded="${expanded}"]`).waitFor({state:'visible'}));}
 assert.equal(await step(()=>settings.getAttribute('aria-expanded')),'false');
}
function assertKeyDiagnostics(value){
 exact(value,['parentFocus','hasFocus','keyups']);assert(focusKinds.includes(value.parentFocus));assert(Array.isArray(value.hasFocus)&&value.hasFocus.length===3&&value.hasFocus.every(v=>typeof v==='boolean'));assert(Array.isArray(value.keyups)&&value.keyups.length===3);
 for(const up of value.keyups){exact(up,['count','key']);count(up.count,1);assert.equal(up.key===null,up.count===0);if(up.key){exact(up.key,['trusted','direction','target']);assert.equal(typeof up.key.trusted,'boolean');assert(['Tab','Shift+Tab'].includes(up.key.direction));assert(focusKinds.includes(up.key.target));}}
}
const maskedNative=(target,sidebarAvailable)=>target==='native-background'||sidebarAvailable&&['history','history-other'].includes(target);
function focusWindow(events,before,sidebarContinuous=false,sidebarAvailable=true){
 assert(Array.isArray(events)&&events.length<=16,'UI06 focus event overflow');let opened=before;
 for(const event of events){exact(event,event.observation==='surface-snapshot'?['target','open','observation']:['target','open']);assert(focusKinds.includes(event.target));count(event.open,sidebarAvailable?2:1);if(opened>0&&maskedNative(event.target,sidebarAvailable))assert.fail('UI06 transient masked native focus');
  if(opened>event.open){assert(['composer','protected-native'].includes(event.target),'UI06 closure without protected native focus');assert.notEqual(event.observation,'surface-snapshot','UI06 snapshot cannot prove native surrender');}
  if(opened===0&&event.open!==0)assert(sidebarContinuous&&event.open===1&&['composer','protected-native'].includes(event.target),'UI06 focus reopened surface');if(sidebarContinuous&&opened===1)assert(event.open<=1,'UI06 focus reopened workspace');opened=event.open;
 }return opened;
}


// Independent reduction of the actual parent CDP response. Matching a label in
// a child target or elsewhere cannot substitute for the original parent node.
export function reduceUI06ParentAX({nodes,frameId,backend,readingMatches}){
 assert(Array.isArray(nodes)&&nodes.length>0&&nodes.length<=100000,'UI06 empty/oversize parent AX');
 assert.equal(typeof frameId,'string');assert(frameId.length>0);
 exact(backend,targets);for(const id of Object.values(backend))assert(Number.isSafeInteger(id)&&id>0,'UI06 missing backend target');
 assert.equal(new Set(Object.values(backend)).size,6,'UI06 ambiguous backend targets');
 assert.equal(readingMatches,true,'UI06 fixture reading sentinel missing');
 const byId=new Map(nodes.map(n=>[n.nodeId,n]));assert.equal(byId.size,nodes.length,'UI06 duplicate AX nodes');
 const roots=nodes.filter(n=>n.role?.value==='RootWebArea'&&!n.ignored&&n.frameId===frameId&&!n.parentId);
 assert.equal(roots.length,1,'UI06 missing parent RootWebArea');const root=roots[0];
 const reachable=n=>{const visited=new Set();while(n){if(n===root)return true;if(visited.has(n.nodeId))return false;visited.add(n.nodeId);n=byId.get(n.parentId);}return false;};
 const roles={reading:'StaticText',history:'link',historyOther:'link',composer:'textbox',workspace:'Iframe',sidebar:'Iframe'};
 const matches=Object.fromEntries(targets.map(key=>[key,nodes.filter(n=>n.backendDOMNodeId===backend[key]&&n.ignored===false&&reachable(n))]));
 return {perspective:'parent',nodes:nodes.length,parentRoot:true,rolesMatch:targets.every(key=>!matches[key].length||matches[key].some(n=>n.role?.value===roles[key])),readingSentinel:matches.reading.some(n=>n.role?.value==='StaticText'&&n.name?.value===sentinel),...Object.fromEntries(targets.map(key=>[key,matches[key].length>0]))};
}
export function assertUI06AXPhase(facts,open,sidebarContinuous=false,sidebarAvailable=true){
 assert(!sidebarContinuous||sidebarAvailable,'UI06 unavailable sidebar cannot be continuous');
 exact(facts,['perspective','nodes','parentRoot','rolesMatch','readingSentinel',...targets]);assert.equal(facts.perspective,'parent');count(facts.nodes);assert(facts.nodes>0);assert.equal(facts.parentRoot,true);assert.equal(facts.rolesMatch,true,'UI06 exposed target role mismatch');assert.equal(facts.readingSentinel,!open,'UI06 parent AX reading sentinel mismatch');
 for(const key of targets)assert.equal(typeof facts[key],'boolean');
 assert.equal(facts.composer,true,'UI06 native composer missing from parent AX');
 assert.equal(facts.reading,!open,'UI06 reading mask/restoration');
 for(const key of ['history','historyOther'])assert.equal(facts[key],!(sidebarAvailable&&(open||sidebarContinuous)),'UI06 native history mask/restoration');
 assert.equal(facts.workspace,open,'UI06 owned workspace iframe parent AX entrance');
 assert.equal(facts.sidebar,sidebarAvailable&&(open||sidebarContinuous),'UI06 owned sidebar iframe parent AX entrance');
}

// Each input is a per-key read of passive listeners in parent + both frames.
// FocusEvent.isTrusted is intentionally not accepted as keyboard provenance.
export function reduceUI06Key({before,after,direction,documents,sidebarContinuous=false,sidebarAvailable=true}){
 assert(!sidebarContinuous||sidebarAvailable,'UI06 unavailable sidebar cannot be continuous');
 count(before,sidebarAvailable?2:1);count(after,sidebarAvailable?2:1);assert(['Tab','Shift+Tab'].includes(direction));
 assert(Array.isArray(documents)&&documents.length===3,'UI06 missing keyboard document');
 assert.deepEqual(documents.map(d=>d.document),['parent','workspace','sidebar']);
 for(const d of documents){exact(d,['document','keys','key','focus','open','events','overflow','hasFocus','ups','up']);count(d.keys,1);assert.equal(typeof d.hasFocus,'boolean');count(d.ups,1);assert.equal(d.up===null,d.ups===0);if(d.up){exact(d.up,['trusted','direction','target']);assert.equal(typeof d.up.trusted,'boolean');assert(['Tab','Shift+Tab'].includes(d.up.direction));assert(focusKinds.includes(d.up.target));}assert.equal(d.overflow,false,'UI06 focus event overflow');assert(Array.isArray(d.events));if(d.document==='parent')count(d.open,2);else{assert.equal(d.open,null);assert.deepEqual(d.events,[]);}assert(focusKinds.includes(d.focus));assert.equal(d.key===null,d.keys===0,'UI06 stale keyboard record');if(d.key){exact(d.key,['trusted','direction','target']);assert.equal(typeof d.key.trusted,'boolean');assert(['Tab','Shift+Tab'].includes(d.key.direction));assert(focusKinds.includes(d.key.target));}}
 const sources=documents.filter(d=>d.keys===1);assert.equal(sources.length,1,'UI06 actual Tab keydown missing/duplicated');
 const source=sources[0];if(!sidebarAvailable){assert.notEqual(source.document,'sidebar','UI06 key from unavailable sidebar');assert.notEqual(documents[0].focus,'sidebar','UI06 focus in unavailable sidebar');}assert(source.key);assert.equal(source.key.trusted,true,'UI06 untrusted keyboard event');assert.equal(source.key.direction,direction);
 if(sidebarContinuous&&before===1)assert.notEqual(source.document,'workspace','UI06 key came from hidden workspace');
 const parent=documents[0];for(const d of documents){if(d.focus==='owned-return'||d.up?.target==='owned-return')assert(d.document==='parent'&&after<=(sidebarContinuous?1:0),'UI06 return control outside closed parent');if(d.key?.target==='owned-return')assert(d.document==='parent'&&before<=(sidebarContinuous?1:0),'UI06 return key outside closed parent');}assert.equal(parent.open,after);assert.equal(focusWindow(parent.events,before,sidebarContinuous,sidebarAvailable),after,'UI06 missing native surrender focus witness');const target=['workspace','sidebar'].includes(parent.focus)?documents.find(d=>d.document===parent.focus).focus:parent.focus;
 if(before>0||after>0)assert(!maskedNative(target,sidebarAvailable),'UI06 keyboard entered masked native background');
 if(sidebarContinuous&&after===1)assert.notEqual(parent.focus,'workspace','UI06 closed workspace focus');
 if(after===0)assert(!['workspace','sidebar','owned-control','owned-other'].includes(target),'UI06 keyboard entered closed owned frame');
 if(before===0){assert(after===0||(sidebarContinuous&&after===1),'UI06 closed traversal reopened a surface');assert.equal(source.document,'parent','UI06 key came from closed frame');assert(!['owned-control','owned-other','workspace','sidebar'].includes(source.key.target),'UI06 key came from closed owned control');}
 const diagnostic={parentFocus:parent.focus,hasFocus:documents.map(d=>d.hasFocus),keyups:documents.map(d=>({count:d.ups,key:d.up}))};assertKeyDiagnostics(diagnostic);
 return {direction,before,after,source:source.document,from:source.key.target,target,trusted:true,nativeFocus:parent.events,diagnostic};
}
export function assertUI06Path(path,{direction,target,open,sidebarContinuous=false,sidebarAvailable=true}){
 assert(!sidebarContinuous||sidebarAvailable,'UI06 unavailable sidebar cannot be continuous');
 exact(path,['direction','start','startOpen','startTrustedClick','elapsedMs','keys']);assert.equal(path.direction,direction);assert.equal(path.startOpen,open?(sidebarAvailable?2:1):0);assert(focusKinds.includes(path.start));
 if(open){assert.equal(path.start,'owned-control');assert.equal(path.startTrustedClick,true);}else assert.equal(path.startTrustedClick,false);
 count(path.elapsedMs,UI06_LIMITS.deadlineMs);assert(Array.isArray(path.keys)&&path.keys.length>0&&path.keys.length<=UI06_LIMITS.keys);
 let previous=path.startOpen;
 for(const key of path.keys){exact(key,['direction','before','after','source','from','target','trusted','nativeFocus','diagnostic']);assertKeyDiagnostics(key.diagnostic);assert.equal(key.direction,direction);assert.equal(key.before,previous);assert.equal(focusWindow(key.nativeFocus,key.before,sidebarContinuous,sidebarAvailable),key.after,'UI06 missing native surrender focus witness');assert.equal(key.trusted,true);assert(['parent','workspace','sidebar'].includes(key.source));if(!sidebarAvailable)assert.notEqual(key.source,'sidebar','UI06 key from unavailable sidebar');if(sidebarContinuous&&key.before===1)assert.notEqual(key.source,'workspace','UI06 key came from hidden workspace');assert(focusKinds.includes(key.from)&&focusKinds.includes(key.target));count(key.after,sidebarAvailable?2:1);if(key.from==='owned-return')assert(key.source==='parent'&&key.before<=(sidebarContinuous?1:0),'UI06 return key outside closed parent');if(key.target==='owned-return')assert(key.source==='parent'&&key.after<=(sidebarContinuous?1:0),'UI06 return control outside closed parent');if(key.before>0||key.after>0)assert(!maskedNative(key.target,sidebarAvailable),'UI06 masked keyboard leak');if(previous===0){assert(key.after===0||(sidebarContinuous&&key.after===1));assert.equal(key.source,'parent');assert(!['owned-control','owned-other','workspace','sidebar'].includes(key.from));}if(key.after===0)assert(!['owned-control','owned-other','workspace','sidebar'].includes(key.target),'UI06 closed keyboard leak');previous=key.after;}
 if(open){assert.equal(path.keys[0].source,'workspace');assert.equal(path.keys[0].from,'owned-control');}
 assert.equal(path.keys.at(-1).target,target,'UI06 requested native target never reached');assert.equal(previous,sidebarContinuous?1:0,'UI06 native input must surrender workspace while preserving the chosen sidebar');
}
export function assertUI06Continuity(value){
 exact(value,['document','plain','rich','fileInput','file','drafts','surfaces','frames','nativeAttributes','nativeNodes','location','actions']);
 for(const key of Object.keys(value))assert.equal(value[key],true,'UI06 continuity changed: '+key);
}

export function installUI06ParentProbe({historySelector,extensionId,sidebarContinuous=false,sidebarAvailable=true}){
   const original={document,plain:globalThis.j3OriginalPlain,rich:globalThis.j3OriginalRich,fileInput:globalThis.j3OriginalFileInput,file:globalThis.j3OriginalFile,reading:document.querySelector('#reading'),history:document.querySelector(historySelector),historyOther:document.querySelector('aside nav[aria-label="Chat history"] a[href="/c/44444444-4444-4444-8444-444444444444"]'),composer:document.querySelector('#composer'),url:location.href,historyLength:history.length};original.historyRoot=original.history?.closest('nav');original.message=original.reading?.querySelector('.message-body');original.messageText=original.message?.firstChild;
   original.surfaces=[...document.querySelectorAll('[data-va-owned][popover]')];original.frames=['workspace','sidebar'].map(role=>document.querySelector(`[data-va-owned] iframe[src="chrome-extension://${extensionId}/${role}.html"]`));
   if(original.surfaces.length!==2||original.frames.some(n=>!n))throw Error('UI06 original surfaces missing');
   const protectedRoots=[original.reading,original.historyRoot,original.composer,original.plain,original.rich,original.fileInput];const attributes=protectedRoots.map(n=>['inert','hidden','aria-hidden','style','class'].map(a=>n.getAttribute(a)));
   let keys=0,key=null,ups=0,up=null,click=false,events=[],overflow=false;const opened=()=>{const nodes=[...document.querySelectorAll('[data-va-owned]:popover-open')];if(!sidebarAvailable&&nodes.some(n=>n.contains(original.frames[1])))throw Error('UI06 unavailable sidebar exposed');if(sidebarContinuous&&nodes.length===1&&nodes[0].contains(original.frames[0]))throw Error('UI06 single role must be sidebar');return nodes.length;};
   const slot=document.querySelector('main header .navigation-slot'),mountId=original.surfaces[0].dataset.vaOwned;
   if(!slot||!mountId||original.surfaces.some(n=>n.dataset.vaOwned!==mountId))throw Error('UI06 return ownership missing');
   const candidates=()=>[...slot.querySelectorAll('button[type="button"][aria-label="返回工作空间"][data-va-owned]')].filter(n=>n.parentElement===slot&&n.dataset.vaOwned===mountId);
   const knownReturns=new WeakSet(),captureReturn=()=>{const nodes=candidates();if(nodes.length!==1)return null;knownReturns.add(nodes[0]);return nodes[0];};let returnNode=captureReturn(),lastOpen=opened();
   const isReturn=n=>{if(!n||n!==returnNode||opened()>(sidebarContinuous?1:0)||!n.isConnected||n.ownerDocument!==document||!slot.isConnected||slot!==document.querySelector('main header .navigation-slot')||n.parentElement!==slot||n.tagName!=='BUTTON'||n.type!=='button'||n.dataset.vaOwned!==mountId||n.getAttribute('aria-label')!=='返回工作空间'||n.closest('[inert]'))return false;const nodes=candidates(),style=getComputedStyle(n),rect=n.getBoundingClientRect();return nodes.length===1&&nodes[0]===n&&style.display!=='none'&&style.visibility==='visible'&&style.opacity!=='0'&&rect.width>0&&rect.height>0;};
   const kind=n=>n===original.rich?'composer':n===original.history?'history':original.historyRoot.contains(n)?'history-other':original.reading.contains(n)?'native-background':n===original.frames[0]?'workspace':n===original.frames[1]?'sidebar':isReturn(n)?'owned-return':knownReturns.has(n)||n?.closest?.('[data-va-owned]')?'owned-other':n?.closest?.('#composer,main header')?'protected-native':n&&n!==document.body?'native-other':'none';
   const record=e=>({trusted:e.isTrusted,direction:e.shiftKey?'Shift+Tab':'Tab',target:kind(e.target)});
   const listener=e=>{if(e.key==='Tab'){keys=Math.min(keys+1,2);key=record(e);}},upListener=e=>{if(e.key==='Tab'){ups=Math.min(ups+1,2);up=record(e);}};
   const syncOpen=(capture=false)=>{const open=opened();if(capture&&open!==lastOpen){if(events.length<16)events.push({target:kind(document.activeElement),open,observation:'surface-snapshot'});else overflow=true;}if(open>(sidebarContinuous?1:0))returnNode=null;lastOpen=open;return open;};
   const focusListener=e=>{const open=opened();if(lastOpen>(sidebarContinuous?1:0)&&open<=(sidebarContinuous?1:0)&&(e.target===original.rich||e.target?.closest?.('#composer,main header')&&!e.target.closest('[data-va-owned]')))returnNode=captureReturn();if(events.length<16)events.push({target:kind(e.target),open});else overflow=true;syncOpen();};
   document.addEventListener('keydown',listener,true);document.addEventListener('keyup',upListener,true);document.addEventListener('focusin',focusListener,true);
   globalThis.__ui06Probe={read:()=>({keys,key,ups,up,hasFocus:document.hasFocus(),focus:kind(document.activeElement),open:syncOpen(true),events:[...events],overflow}),reset:()=>{keys=0;key=null;ups=0;up=null;click=false;events=[];overflow=false;syncOpen();},clicked:()=>click,cleanup:()=>{document.removeEventListener('keydown',listener,true);document.removeEventListener('keyup',upListener,true);document.removeEventListener('focusin',focusListener,true);},continuity:()=>({document:original.document===document&&globalThis.j3OriginalDocument===document,plain:original.plain===document.querySelector('[data-j3-editor=plain]')&&original.plain.isConnected,rich:original.rich===document.querySelector('#prompt-textarea')&&original.rich.isConnected,fileInput:original.fileInput===document.querySelector('#composer input[type=file]'),file:original.fileInput.files[0]===original.file,drafts:original.plain.value==='J3_UNSENT_PLAIN_DRAFT'&&original.rich.textContent==='J3_UNSENT_RICH_DRAFT',surfaces:original.surfaces.every(n=>n.isConnected)&&original.surfaces.length===document.querySelectorAll('[data-va-owned][popover]').length,frames:original.frames.every(n=>n.isConnected)&&original.frames.length===document.querySelectorAll('[data-va-owned] iframe').length,location:location.href===original.url&&history.length===original.historyLength,nativeNodes:protectedRoots.every(n=>n?.isConnected)&&original.reading===document.querySelector('#reading')&&original.composer===document.querySelector('#composer')&&original.historyRoot===document.querySelector('aside nav[aria-label="Chat history"]')&&original.history===document.querySelector(historySelector)&&original.historyOther.isConnected&&original.historyOther===original.historyRoot.querySelector('a[href="/c/44444444-4444-4444-8444-444444444444"]')&&original.message===original.reading.querySelector('.message-body')&&original.messageText===original.message.firstChild,nativeAttributes:protectedRoots.every(n=>!n.closest('[inert]'))&&protectedRoots.every((n,i)=>['inert','hidden','aria-hidden','style','class'].every((a,j)=>n.getAttribute(a)===attributes[i][j]))})};
}

export async function runUI06KeyboardAX({page,context,extensionId,workspace,nativeReading,draft,snapshotActions,trace,sidebarAvailable=true}){
 const actionBaseline=snapshotActions();let cdp,frames;
 const report=Object.assign(trace??{},{scope:'UI06_J3_SUBCASE_NOT_FULL_ACCEPTANCE',phase:'setup',sidebarAvailable,ax:[],paths:[],continuity:[]});
 const openCount=()=>page.locator('[data-va-owned]:popover-open').count();
 const readDocuments=async deadline=>{const trace=[];report.snapshots??=[];report.snapshots.push(trace);return readUI06StableDocuments({deadline,trace,readRound:async()=>Promise.all([['parent',page],['workspace',frames.workspace],['sidebar',frames.sidebar]].map(async([document,frame])=>({document,...await frame.evaluate(()=>globalThis.__ui06Probe.read())})))});};
 const reset=async()=>Promise.all([page,frames.workspace,frames.sidebar].map(f=>f.evaluate(()=>globalThis.__ui06Probe.reset())));
 async function continuity(){await draft();const state=await page.evaluate(()=>globalThis.__ui06Probe.continuity());state.actions=JSON.stringify(snapshotActions())===JSON.stringify(actionBaseline);assertUI06Continuity(state);report.continuity.push(state);}
 async function ax(open,sidebarContinuous=false){
  report.phase=open?'open-ax':'closed-ax';const deadline=createUI06Deadline(),timed=operation=>deadline.run(operation);
  const {root}=await timed(()=>cdp.send('DOM.getDocument',{depth:0})),backend={};
  for(const [key,selector] of Object.entries({reading:'#reading .message-body',history:historySelector,historyOther:'aside nav[aria-label="Chat history"] a[href="/c/44444444-4444-4444-8444-444444444444"]',composer:'#prompt-textarea',workspace:`[data-va-owned] iframe[src="chrome-extension://${extensionId}/workspace.html"]`,sidebar:`[data-va-owned] iframe[src="chrome-extension://${extensionId}/sidebar.html"]`})){
   const {nodeIds}=await timed(()=>cdp.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector}));assert.equal(nodeIds.length,1,'UI06 missing/ambiguous parent DOM target');
   const {node}=await timed(()=>cdp.send('DOM.describeNode',{nodeId:nodeIds[0],depth:key==='reading'?1:0}));backend[key]=key==='reading'?node.children?.find(n=>n.nodeType===3)?.backendNodeId:node.backendNodeId;
  }
  const {frameTree}=await timed(()=>cdp.send('Page.getFrameTree')),{nodes}=await timed(()=>cdp.send('Accessibility.getFullAXTree'));
  const readingMatches=await timed(()=>page.locator('#reading .message-body').evaluate((n,s)=>n.textContent===s,sentinel));
  const facts=reduceUI06ParentAX({nodes,frameId:frameTree.frame.id,backend,readingMatches});report.ax.push({phase:open?'open':'closed',...facts});assertUI06AXPhase(facts,open,sidebarContinuous,sidebarAvailable);await timed(continuity);
 }
 async function walk(direction,target,open,sidebarContinuous=false){
  report.phase=open?(direction==='Tab'?'open-forward':'open-backward'):(target==='history'?'closed-history':'closed-composer');const deadline=createUI06Deadline(),timed=operation=>deadline.run(operation),startDocuments=await readDocuments(deadline),startOpen=startDocuments[0].open;
  const start=open?startDocuments[1].focus:startDocuments[0].focus;
  const startTrustedClick=open?await timed(()=>frames.workspace.evaluate(()=>globalThis.__ui06Probe.clicked())):false;
  const path={direction,start,startOpen,startTrustedClick,elapsedMs:0,keys:[]};report.paths.push(path);
  for(let i=0;i<UI06_LIMITS.keys;i++){
   const before=await timed(openCount);await timed(reset);await timed(()=>page.keyboard.press(direction));
   const documents=await readDocuments(deadline),after=documents[0].open;const key=reduceUI06Key({before,after,direction,documents,sidebarContinuous,sidebarAvailable});path.keys.push(key);path.elapsedMs=deadline.elapsed();
   if(key.target===target)break;
  }
  path.elapsedMs=deadline.elapsed();assertUI06Path(path,{direction,target,open,sidebarContinuous,sidebarAvailable});await timed(continuity);
 }
 try{
  // A real native composer pointer action establishes the closed baseline. It is
  // not counted as keyboard reachability and never activates a native handler.
  const setup=createUI06Deadline(),ready=operation=>setup.run(operation);await ready(nativeReading);await ready(()=>page.locator('#prompt-textarea').click());assert.equal(await ready(openCount),Number(sidebarAvailable));if(sidebarAvailable)await ready(()=>page.locator('[data-va-owned][id$="_sidebar"]:popover-open').waitFor());await ready(draft);
  frames=Object.fromEntries(['workspace','sidebar'].map(role=>[role,page.frames().find(f=>f.url()===`chrome-extension://${extensionId}/${role}.html`)]));assert(frames.workspace&&frames.sidebar);
  await ready(()=>page.evaluate(installUI06ParentProbe,{historySelector,extensionId,sidebarContinuous:sidebarAvailable,sidebarAvailable}));
  for(const frame of Object.values(frames))await ready(()=>frame.evaluate(()=>{
   let keys=0,key=null,ups=0,up=null,click=false;const active=()=>{let n=document.activeElement;while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;return n;};
   const kind=n=>n?.matches?.('button,a,input,select,textarea,[contenteditable=true]')?'owned-control':n&&n!==document.body?'owned-other':'none';
   const keyListener=e=>{if(e.key==='Tab'){keys=Math.min(keys+1,2);key={trusted:e.isTrusted,direction:e.shiftKey?'Shift+Tab':'Tab',target:kind(e.composedPath()[0])};}},upListener=e=>{if(e.key==='Tab'){ups=Math.min(ups+1,2);up={trusted:e.isTrusted,direction:e.shiftKey?'Shift+Tab':'Tab',target:kind(e.composedPath()[0])};}},clickListener=e=>{click=e.isTrusted&&kind(e.composedPath().find(n=>n?.matches?.('button'))) ==='owned-control';};
   document.addEventListener('keydown',keyListener,true);document.addEventListener('keyup',upListener,true);document.addEventListener('click',clickListener,true);
   globalThis.__ui06Probe={read:()=>({keys,key,ups,up,hasFocus:document.hasFocus(),focus:kind(active()),open:null,events:[],overflow:false}),reset:()=>{keys=0;key=null;ups=0;up=null;click=false;},clicked:()=>click,cleanup:()=>{document.removeEventListener('keydown',keyListener,true);document.removeEventListener('keyup',upListener,true);document.removeEventListener('click',clickListener,true);}};
  }));
  cdp=await ready(()=>context.newCDPSession(page));await ax(false,sidebarAvailable);
  // Preserve the original forward case and its strict failure. Run it last so
  // an unresolved document-end/browser-focus boundary cannot erase the other
  // independent backward and closed-restoration observations.
  for(const direction of ['Shift+Tab','Tab']){
   report.phase=direction==='Tab'?'seed-forward':'seed-backward';const seed=createUI06Deadline(),step=operation=>seed.run(operation);await step(workspace);await step(continuity);
   // Only a local UI toggle. Restore its original collapsed state, retaining a
   // real trusted control seed without navigation or action dispatch.
   await seedUI06Settings(frames.workspace,seed);
   assert.equal(await step(openCount),1+Number(sidebarAvailable));await ax(true);await walk(direction,'composer',true,sidebarAvailable);await ax(false,sidebarAvailable);
   if(direction==='Shift+Tab'){if(sidebarAvailable){await page.getByRole('button',{name:'显示原生列表',exact:true}).click();await page.locator('[data-va-owned][id$="_sidebar"]').waitFor({state:'hidden'});}await page.locator('#prompt-textarea').click();await ax(false);await walk('Shift+Tab','history',false);await walk('Tab','composer',false);await ax(false);}
  }
  if(sidebarAvailable){await page.getByRole('button',{name:'显示原生列表',exact:true}).click();await page.locator('[data-va-owned][id$="_sidebar"]').waitFor({state:'hidden'});}await ax(false);report.phase='done';return report;
 }finally{
  // Cleanup never hides the original assertion/error. Passive test listeners
  // are removed independently even if a frame/document unexpectedly vanished.
  for(const frame of [page,...Object.values(frames??{})])try{await createUI06Deadline({limit:1000}).run(()=>frame.evaluate(()=>{globalThis.__ui06Probe?.cleanup();delete globalThis.__ui06Probe;}));}catch{}
  try{await createUI06Deadline({limit:1000}).run(()=>cdp?.detach());}catch{}
 }
}
