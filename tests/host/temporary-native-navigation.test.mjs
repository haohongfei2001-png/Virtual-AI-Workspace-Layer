import test from 'node:test';
import assert from 'node:assert/strict';
import {installTemporaryNativeNavigation} from '../../src/host/temporary-native-navigation.mjs';
const origin='https://chatgpt.com',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const link=(n,title='Chat '+n,extra={})=>({isConnected:true,innerText:title,attrs:{href:'/c/'+id(n)},parentElement:null,closest:()=>null,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute(k){return this.attrs[k]??null;},...extra});
function fixture(nodes=[]){let listener,callback,reads=0,disconnected=0,takes=0;const events=new Map(),sent=[];
 const root={closest:()=>null,querySelectorAll:()=>nodes,contains:n=>nodes.includes(n)},sidebar={isConnected:true,getClientRects:()=>[{}],getAttribute:()=>null,closest:()=>null,querySelectorAll:()=>[root]},win={getComputedStyle:n=>n.style??{display:'block',visibility:'visible'},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),MutationObserver:class{constructor(fn){callback=fn;}observe(){}takeRecords(){takes++;return [];}disconnect(){disconnected++;}}};win.top=win;
 const document={defaultView:win,location:{origin,href:origin+'/'},documentElement:{},querySelectorAll:()=>{reads++;return [sidebar];},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,sendMessage:m=>{sent.push(m);return Promise.resolve();},onMessage:{addListener:f=>{listener=f;},removeListener:f=>{if(listener===f)listener=null;}}};
 const stop=installTemporaryNativeNavigation({document,runtime,origin,profile:{id:'chatgpt-zh-desktop-observed-20261018',regions:{projects:'nav',history:'nav'}}});
 return {document,root,sidebar,sent,stop,events,reads:()=>reads,takes:()=>takes,disconnected:()=>disconnected,active:()=>!!listener,mutate:(target,type='childList')=>callback([{target,type,removedNodes:[]}]),request(message={v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},sender={id:'extension',url:runtime.getURL('status.html')}){let response;listener?.(message,sender,value=>{response=value;});return response;}};
}
test('only fixed private popup gets native title/href snapshot with no authority fields',()=>{const f=fixture([link(1)]),r=f.request();assert.deepEqual(r,{v:1,mode:'temporary-native-navigation',route:origin+'/',items:[{kind:'conversation',title:'Chat 1',href:origin+'/c/'+id(1)}],partial:false});assert.equal(f.sent.length,0);f.stop();});
test('forged sender and extra request fields cannot scan DOM or drain observer',()=>{const f=fixture([link(1)]);for(const sender of [{},{id:'other',url:'chrome-extension://extension/status.html'},{id:'extension',url:origin+'/'},{id:'extension',url:'chrome-extension://extension/workspace.html'},{id:'extension',url:'chrome-extension://extension/status.html',tab:{}},{id:'extension',url:'chrome-extension://extension/status.html#x'}])assert.equal(f.request(undefined,sender),undefined);for(const message of [{v:1,type:'HOST_TEMPORARY_NATIVE_LIST',scope:'forged'},{v:2,type:'HOST_TEMPORARY_NATIVE_LIST'}])assert.equal(f.request(message),undefined);assert.equal(f.reads(),0);assert.equal(f.takes(),0);f.stop();});
test('hidden ancestors, disconnected nodes and invalid native URLs are excluded',()=>{const hidden=link(2);hidden.parentElement={hidden:true,getAttribute:()=>null,parentElement:null};const css=link(3);css.parentElement={style:{display:'none',visibility:'visible'},getAttribute:()=>null,parentElement:null};const f=fixture([link(1),hidden,css,link(4,'Gone',{isConnected:false}),link(5,'External',{attrs:{href:'https://evil.test/c/'+id(5)}}),link(6,'Script',{attrs:{href:'javascript:alert(1)'}})]);assert.deepEqual(f.request().items.map(n=>n.title),['Chat 1']);f.stop();});
test('same native identity with conflicting titles is entirely removed and cannot return later in scan',()=>{const f=fixture([link(1,'One'),link(1,'Two'),link(1,'One'),link(2,'Safe'),link(2,'Safe')]),r=f.request();assert.deepEqual(r.items.map(n=>n.title),['Safe']);assert.equal(r.partial,true);f.stop();});
test('item cap is 256 and flags partial inventory',()=>{const f=fixture(Array.from({length:257},(_,n)=>link(n))),r=f.request();assert.equal(r.items.length,256);assert.equal(r.partial,true);f.stop();});
test('UTF8 row budget is bounded at 49152 bytes without clipping titles',()=>{const title='中'.repeat(1000),f=fixture(Array.from({length:30},(_,n)=>link(n,title))),r=f.request();assert(r.items.length>0&&r.items.length<30);assert.equal(r.partial,true);assert(r.items.every(n=>n.title===title));assert(r.items.reduce((sum,n)=>sum+new TextEncoder().encode(JSON.stringify(n)).length,0)<=49152);f.stop();});
test('snapshot invalidation is one-shot until a new explicit read; stop cleans listeners and observer',()=>{const f=fixture([link(1)]);f.mutate(f.root);assert.equal(f.sent.length,0);f.request();f.mutate(f.root);f.mutate(f.root);f.events.get('visibilitychange')();assert.deepEqual(f.sent,[{v:1,type:'HOST_TEMPORARY_NATIVE_INVALIDATED'}]);f.request();f.events.get('pagehide')();assert.equal(f.sent.length,2);f.request();f.stop();assert.equal(f.sent.length,3);assert.equal(f.active(),false);assert.equal(f.events.size,0);assert.equal(f.disconnected(),1);f.stop();f.mutate(f.root);assert.equal(f.sent.length,3);assert.equal(f.disconnected(),1);});

test('reading links never have their text read, and ambiguous sidebar fails closed',()=>{const secret=link(2);secret.closest=()=>({});Object.defineProperty(secret,'innerText',{get(){throw Error('body-read');}});const f=fixture([link(1),secret]);assert.equal(f.request().items.length,1);f.document.querySelectorAll=()=>[f.sidebar,f.sidebar];assert.equal(f.request().unavailable,true);f.stop();});
test('ancestor visibility changes invalidate snapshots',()=>{const f=fixture([link(1)]);f.request();f.mutate({contains:n=>n===f.root},'attributes');assert.equal(f.sent.length,1);f.stop();});

test('browser-hidden disclosure link is excluded before its title is read even with layout boxes',()=>{const hidden=link(2,{toString(){throw Error('hidden-title-read');}});hidden.checkVisibility=options=>{assert.deepEqual(options,{checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true});return false;};Object.defineProperty(hidden,'innerText',{get(){throw Error('hidden-title-read');}});const f=fixture([link(1),hidden]),r=f.request();assert.deepEqual(r.items.map(n=>n.title),['Chat 1']);assert.equal(r.partial,false);f.stop();});

test('observed narrow native sidebar replaces hidden desktop boundary without reading hidden links',()=>{
 const f=fixture([link(1)]),desktop={...f.sidebar,checkVisibility:()=>false,querySelectorAll:()=>{throw Error('hidden-desktop-read');}};
 f.document.querySelectorAll=selector=>{assert(selector.includes('div[role="dialog"][aria-modal="true"][data-state="open"] [data-sidebar-navigation-root]'));return [desktop,f.sidebar];};
 assert.equal(f.request().items.length,1);f.mutate({contains:n=>n===f.sidebar},'attributes');assert.equal(f.sent.length,1);f.stop();
});
test('no visible sidebar and multiple visible native sidebar roots fail closed before titles',()=>{
 for(const mode of ['hidden','ambiguous']){const f=fixture([link(1)]);if(mode==='hidden')f.sidebar.checkVisibility=()=>false;else f.document.querySelectorAll=()=>[f.sidebar,{...f.sidebar}];assert.equal(f.request().unavailable,true);f.stop();}
});
test('sibling native sidebar appearance, replacement and removal invalidate without reading titles',()=>{
 for(const direction of ['desktop-to-narrow','narrow-to-desktop'])for(const change of ['show','insert','replace','remove']){
  const f=fixture([link(1)]);let otherVisible=false;
  const other={...f.sidebar,checkVisibility:()=>otherVisible,querySelectorAll:()=>{throw Error('sibling-title-read');}};
  let boundaries=change==='insert'?[f.sidebar]:[f.sidebar,other];
  f.document.querySelectorAll=()=>direction==='desktop-to-narrow'?boundaries:[...boundaries].reverse();
  assert.equal(f.request().items.length,1);
  if(change==='insert')boundaries.push(other);
  if(change==='remove')boundaries=[];else otherVisible=true;
  if(change==='replace')f.sidebar.checkVisibility=()=>false;
  f.mutate({contains:()=>false},change==='show'?'attributes':'childList');
  assert.equal(f.sent.length,1,`${direction}:${change}`);f.mutate(f.root);assert.equal(f.sent.length,1);f.stop();
 }
});
test('unrelated mutations neither read titles nor invalidate unchanged sidebar boundaries',()=>{
 const node=link(1),f=fixture([node]);f.request();Object.defineProperty(node,'innerText',{get(){throw Error('unrequested-title-read');}});
 f.mutate({contains:()=>false},'attributes');assert.equal(f.sent.length,0);f.stop();
});
test('CSS-only viewport changes clear a snapshot without scanning or reading hidden titles',()=>{
 const node=link(1),f=fixture([node]);f.request();const reads=f.reads();f.sidebar.checkVisibility=()=>false;
 Object.defineProperty(node,'innerText',{get(){throw Error('hidden-title-read');}});
 f.events.get('resize')();f.events.get('resize')();assert.equal(f.sent.length,1);assert.equal(f.reads(),reads);
 f.stop();assert.equal(f.events.size,0);
});
