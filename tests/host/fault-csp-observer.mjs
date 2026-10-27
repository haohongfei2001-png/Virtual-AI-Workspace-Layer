import assert from 'node:assert/strict';
import {disableStatesProfile} from './disable-states-profile.mjs';
/** Serializable pre-navigation observers. No authority is created or modified. */
export function copyCspMessage(value){
 const seen=new Set();let nodes=0;
 function copy(v,depth){
  if(++nodes>4096||depth>12)throw Error('capture-limit');
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v!=='object'||seen.has(v))throw Error('unsupported');
  const proto=Object.getPrototypeOf(v);if(!Array.isArray(v)&&proto!==Object.prototype&&proto!==null)throw Error('unsupported');
  if(Reflect.ownKeys(v).some(k=>typeof k!=='string'))throw Error('unsupported');seen.add(v);
  const out=Array.isArray(v)?[]:{};
  if(Array.isArray(v)&&Object.keys(v).length!==v.length)throw Error('unsupported');
  for(const k of Object.keys(v)){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error('unsupported');Object.defineProperty(out,k,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}
  seen.delete(v);return out;
 }return copy(value,0);
}
export function cspObservationScript(){return `(${installCspObservation.toString()})(${copyCspMessage.toString()})`;}
export function installCspObservation(copy){
 if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){
  const seen={joins:0,views:0,grant:null,scope:null};globalThis.__faultCspRuntime=seen;
  const send=chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage=function(...args){const result=send(...args);if(result?.then)result.then(reply=>{
   if(reply?.ok===true&&reply.grant){seen.grant=reply.grant;globalThis.__faultCspRecord?.({kind:'private-grant',role:location.pathname,markers:[reply.grant.id,reply.grant.scopeGrantId]}).catch(()=>{});}
   if(args[0]?.type==='HOST_UI_JOIN'&&reply?.ok===true)seen.joins++;
   if(args[0]?.type==='HOST_UI_VIEW'&&reply?.ok===true&&reply.state==='ready'){seen.views++;seen.scope=reply.page?.scope??null;globalThis.__faultCspRecord?.({kind:'private-view',role:location.pathname}).catch(()=>{});}
  },()=>{});return result;};return;
 }
 if(location.protocol!=='http:')return;
 const data={messages:[],bytes:0,dropped:0,unsupported:0,dom:[],shell:[],domBytes:0};globalThis.__faultCspPage=data;
 addEventListener('message',e=>{try{const serialized=JSON.stringify(copy(e.data));if(typeof serialized!=='string'){data.unsupported++;return;}const bytes=new TextEncoder().encode(serialized).length;
  if(data.messages.length>=128||bytes>65536||data.bytes+bytes>262144){data.dropped++;return;}
  data.messages.push({origin:e.origin,value:JSON.parse(serialized)});data.bytes+=bytes;
  }catch{data.unsupported++;}});
 // Retain bounded historical values, including removed nodes and old values.
 const observed=new WeakSet();
 function isOwned(node){const visited=new Set();while(node&&!visited.has(node)){visited.add(node);if(node.closest?.('[data-va-owned]'))return true;node=node.host??node.parentElement??node.getRootNode?.()?.host;}return false;}
 function add(value,owned){if(typeof value!=='string'||!value)return;const bytes=new TextEncoder().encode(value).length;if(data.dom.length>=16384||data.domBytes+bytes>1048576){data.dropped++;return;}data.dom.push(value);if(owned)data.shell.push(value);data.domBytes+=bytes;}
 function walk(node,inherited=false){const owned=inherited||isOwned(node);if(node.nodeType===3)add(node.nodeValue,owned||isOwned(node.parentElement));if(node.nodeType===1){for(const a of node.attributes)add(a.value,owned);if(typeof node.value==='string')add(node.value,owned);if(node.shadowRoot){watch(node.shadowRoot);walk(node.shadowRoot,owned);}}for(const child of node.childNodes??[])walk(child,owned);}
 const observer=new MutationObserver(records=>{for(const r of records){const owned=isOwned(r.target);if(r.oldValue)add(r.oldValue,owned);if(r.type==='childList'){for(const n of r.addedNodes)walk(n,owned);for(const n of r.removedNodes)walk(n,owned);}else walk(r.target,owned);}});
 function watch(root){if(observed.has(root))return;observed.add(root);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true});}
 watch(document);walk(document);addEventListener('input',e=>walk(e.target),true);addEventListener('change',e=>walk(e.target),true);
 const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(...args){const root=attach.apply(this,args);if(args[0]?.mode==='open')watch(root);return root;};
}
export function installCspMountObservation({extensionId}){
 if(location.protocol!=='http:')return;
 const data={attempts:0,violations:0,byRole:{workspace:0,sidebar:0}};globalThis.__faultCspMounts=data;
 const seen=new WeakMap(),targets=new Map(['workspace','sidebar'].map(role=>[`chrome-extension://${extensionId}/${role}.html`,role]));
 function visit(n,force=false){if(n.nodeType===1&&n.tagName==='IFRAME'){const role=targets.get(n.src);if(role&&(force||seen.get(n)!==n.src)){seen.set(n,n.src);data.attempts++;data.byRole[role]++;}}for(const child of n.childNodes??[])visit(child,force);}
 new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')visit(r.target,true);else for(const n of r.addedNodes)visit(n,true);}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='frame-src'&&targets.has(e.blockedURI))data.violations++;});visit(document);
}
export function exactBlockedCandidatesReply(value){return !!value&&value.ok===false&&value.state==='blocked'&&Object.keys(value).sort().join(',')==='ok,state';}
export async function scanCspPage({page,extensionId,privateMarkers=[]}){
 const expected=disableStatesProfile('LEGACY'),shell=await page.evaluate(cspDomStrings,true),full=await page.evaluate(cspDomStrings,false),capture=await page.evaluate(()=>structuredClone(__faultCspPage));
 const markers=[expected.scopeKey,...privateMarkers,'"scopeGrantId":','"viewSession":','"grantId":'];
 const extensionMessages=capture.messages.filter(m=>m.origin===`chrome-extension://${extensionId}`);
 return {pageProjectionLeaks:cspLeaks([...shell.strings,...capture.shell],[expected.title])+cspLeaks([...full.strings,...capture.dom],markers),pageMessageLeaks:cspLeaks(capture.messages.map(m=>JSON.stringify(m.value)),[...markers,expected.title]),captureDropped:capture.dropped+shell.dropped+full.dropped,captureUnsupported:capture.unsupported,pageDOMScannedValues:full.strings.length,extensionPageMessagesObserved:extensionMessages.length,exactControlMessageSchemas:extensionMessages.every(m=>exactCspControlMessage(m.value))};
}
/** Collect only strings, with a hard cap; the runner scans sensitive markers privately. */
export function cspDomStrings(ownedOnly=false){
 const output={strings:[],bytes:0,dropped:0};const seen=new Set();
 function add(v){if(typeof v!=='string'||!v)return;const n=new TextEncoder().encode(v).length;if(output.strings.length>=8192||output.bytes+n>524288){output.dropped++;return;}output.strings.push(v);output.bytes+=n;}
 function walk(node){if(seen.has(node))return;seen.add(node);if(node.nodeType===3){add(node.nodeValue);return;}if(node.nodeType===1){for(const a of node.attributes)add(a.value);if('value'in node&&typeof node.value==='string')add(node.value);if(node.shadowRoot)walk(node.shadowRoot);}for(const child of node.childNodes??[])walk(child);}
 if(ownedOnly)for(const root of document.querySelectorAll('[data-va-owned]'))walk(root);else walk(document);
 return output;
}
export function cspLeaks(strings,markers){return strings.reduce((count,s)=>count+markers.filter(v=>typeof v==='string'&&v.length>0&&s.includes(v)).length,0);}
export function exactCspControlMessage(value){
 if(value?.type==='VAIWL_UI_INTRINSIC_SIZE')return typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='height,role,type'&&value.role==='sidebar'&&Number.isInteger(value.height)&&value.height>=128&&value.height<=1024;
 if(value?.type==='VAIWL_UI_SIDEBAR_WHEEL')return typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='delta,role,type,x,y'&&value.role==='sidebar'&&[value.x,value.y,value.delta].every(Number.isInteger)&&value.x>=0&&value.x<=4096&&value.y>=0&&value.y<=1024&&value.delta!==0&&Math.abs(value.delta)<=1024;
 if(value?.type==='VAIWL_UI_REVEAL_FOCUS')return typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='bottom,role,top,type'&&value.role==='sidebar'&&Number.isInteger(value.top)&&Number.isInteger(value.bottom)&&value.top>=0&&value.bottom>value.top&&value.bottom<=1024;
 const expected={VAIWL_UI_JOIN:['type','role','nonce'],VAIWL_UI_IDLE_ACK:['type','role','requestId'],VAIWL_UI_EXIT:['type','role'],VAIWL_UI_SUSPEND:Object.hasOwn(value??{},'reason')?['type','role','reason']:['type','role'],VAIWL_UI_BOOT:['type','role','stage']}[value?.type];
 return !!expected&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',')&&['workspace','sidebar'].includes(value.role)&&(!expected.includes('stage')||['entry-ready','dom-ready','entry-resource-failed','script-error','promise-rejected','module-ready'].includes(value.stage))&&(!expected.includes('reason')||['ui-grant-expired','ui-renew-failed','ui-join-failed','ui-port-disconnected','ui-renderer-failed','read-budget-exhausted','frame-preparation-limit','free-frame-page-too-large','frame-view-unavailable','invalid-preparation-response','invalid-frame-view','invalid-search-snippets','invalid-frame-current','invalid-frame-current-ref','invalid-frame-navigation','invalid-frame-presentation','request-timeout'].includes(value.reason))&&(!expected.includes('nonce')||typeof value.nonce==='string'&&value.nonce.length>0)&&(!expected.includes('requestId')||typeof value.requestId==='string'&&value.requestId.length>0);
}
export async function observeAuthenticatedCsp({page,context,worker,extensionId,until}){
 const expected=disableStatesProfile('LEGACY'),raw=[],frames=[],actualFrames=[];
 for(const role of ['workspace','sidebar']){
  let frame;
  await until(async()=>{frame=page.frames().find(f=>f.url()===`chrome-extension://${extensionId}/${role}.html`);try{return !!frame&&await frame.evaluate(()=>!!__faultCspRuntime?.grant&&__faultCspRuntime.joins>0&&__faultCspRuntime.views>0);}catch{return false;}});
  actualFrames.push(frame);const value=await frame.evaluate(()=>structuredClone(__faultCspRuntime));assert(value.grant);for(const key of ['id','mountId','parentDocumentId','uiDocumentId','scopeGrantId','role','expiresAt'])assert.equal(typeof value.grant[key],'string');raw.push(value);
  const browserContext=await worker.evaluate(async grant=>{
   const rows=await chrome.runtime.getContexts({documentIds:[grant.uiDocumentId]});if(rows.length!==1)return null;const child=rows[0],parent=await chrome.webNavigation.getFrame({tabId:child.tabId,frameId:0});return {child,parent};
  },value.grant);
  const dom=await frame.evaluate(cspDomStrings);assert.equal(dom.dropped,0);
  const own=await frame.evaluate(grant=>chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:grant.id,mountId:grant.mountId,offset:0}),value.grant);
  const child=browserContext?.child,parent=browserContext?.parent;
  frames.push({role,urlRole:frame.url().endsWith('/'+value.grant.role+'.html')?value.grant.role:null,actualBrowserContextMatched:child?.contextType==='TAB'&&child.incognito===false&&child.frameId>0&&child.documentId===value.grant.uiDocumentId&&child.documentUrl===frame.url()&&child.documentOrigin===`chrome-extension://${extensionId}`&&parent?.documentLifecycle==='active'&&parent.documentId===value.grant.parentDocumentId&&parent.url===page.url(),joinSucceeded:value.joins>0,viewSucceeded:value.views>0,scopeMatchesIndependentOracle:value.scope===expected.scopeKey,grantUnexpired:Date.parse(value.grant.expiresAt)>Date.now(),nativeProjectionRendered:dom.strings.some(s=>s.includes(expected.title)),privateDetectorPositive:cspLeaks(dom.strings,[expected.title])>0,privateScannedValues:dom.strings.length,ownGrantReadSucceeded:own?.ok===true});
 }
 const focusBefore=await page.evaluate(()=>document.hasFocus()),cdp=await context.browser().newBrowserCDPSession();let foreign,probe;
 try{const pending=context.waitForEvent('page',{timeout:15000});await cdp.send('Target.createTarget',{url:`chrome-extension://${extensionId}/workspace.html`,background:true});probe=await pending;await probe.waitForLoadState('domcontentloaded');foreign=await probe.evaluate(grant=>chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:grant.id,mountId:grant.mountId,offset:0}),raw[0].grant);}finally{await probe?.close();await cdp.detach();}
 const focusAfter=await page.evaluate(()=>document.hasFocus());
 for(let i=0;i<actualFrames.length;i++){assert.equal(actualFrames[i].isDetached(),false);const reply=await actualFrames[i].evaluate(grant=>chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:grant.id,mountId:grant.mountId,offset:0}),raw[i].grant);frames[i].postNegativeOwnGrantReadSucceeded=reply?.ok===true;}

 const privateMarkers=raw.flatMap(v=>[v.grant.id,v.grant.scopeGrantId,v.scope]);
 const rescan=()=>scanCspPage({page,extensionId,privateMarkers});
 const proof={foreignProbePreservedNativeFocus:focusBefore===true&&focusAfter===true,branch:'ISOLATED_AUTHENTICATED',status:'PASS_NARROW_CSP_ISOLATED_AUTHENTICATED_SURFACES',frames,distinctRoleGrants:raw[0].grant.id!==raw[1].grant.id,distinctUIDocuments:raw[0].grant.uiDocumentId!==raw[1].grant.uiDocumentId,sameActualParent:raw[0].grant.parentDocumentId===raw[1].grant.parentDocumentId,sameMount:raw[0].grant.mountId===raw[1].grant.mountId,foreignSenderDenied:exactBlockedCandidatesReply(foreign),foreignSenderReturnedPrivateFields:!exactBlockedCandidatesReply(foreign),...await rescan()};
 const recheck=async()=>{for(let i=0;i<actualFrames.length;i++){if(actualFrames[i].isDetached())return false;const valid=await actualFrames[i].evaluate(async grant=>__faultCspRuntime.grant?.id===grant.id&&(await chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:grant.id,mountId:grant.mountId,offset:0}))?.ok===true,raw[i].grant);if(!valid)return false;}return true;};
 return {proof,rescan,recheck};
}

/** Native input deliberately surrenders overlays. Re-enter only through the real user control. */
export async function prepareCspNativeClose(page){
 const close=page.getByRole('button',{name:'返回原生阅读',exact:true});
 const before={workspaceCloseVisible:await close.isVisible(),nativeReadingVisible:await page.locator('#reading').isVisible(),nativeComposerVisible:await page.locator('textarea').isVisible()};
 let returnedThroughNativeControl=false;
 if(!before.workspaceCloseVisible){
  assert.equal(before.nativeReadingVisible,true,'closed workspace must already preserve native reading');assert.equal(before.nativeComposerVisible,true);
  const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor({state:'visible'});await back.click();returnedThroughNativeControl=true;
 }
 await close.waitFor({state:'visible'});await page.getByRole('button',{name:'显示原生列表',exact:true}).waitFor({state:'visible'});
 return {before,returnedThroughNativeControl,bothCloseControlsVisible:true};
}
