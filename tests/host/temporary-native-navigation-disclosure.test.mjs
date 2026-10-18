import test from 'node:test';
import assert from 'node:assert/strict';
import {installTemporaryNativeNavigation} from '../../src/host/temporary-native-navigation.mjs';

// Deliver only mutations the installed observer actually subscribed to. Calling
// its callback for an excluded attribute would conceal the production defect.
function fixture({empty=false}={}) {
 const origin='https://chatgpt.com';let listener,callback,options,visible=true;
 const sent=[];
 const element=(parent=null)=>({parentElement:parent,isConnected:true,hidden:false,closest:()=>null,getAttribute:()=>null,contains(other){for(let n=other;n;n=n.parentElement)if(n===this)return true;return false;}});
 const documentElement=element(),sidebar=element(documentElement),disclosure=element(sidebar),bodyContent=element(documentElement);
 const link=element();Object.assign(link,{innerText:'Native Project',getAttribute:k=>k==='href'?'/g/g-p-'+ '1'.repeat(32)+'/project':null,getClientRects:()=>visible?[{}]:[]});
 const newNav=()=>{const nav=element(disclosure);nav.querySelectorAll=()=>[link];link.parentElement=nav;return nav;};
 let navs=empty?[]:[newNav()];sidebar.querySelectorAll=()=>navs;
 const win={getComputedStyle:()=>({display:'block',visibility:'visible'}),addEventListener(){},removeEventListener(){},MutationObserver:class {constructor(fn){callback=fn;}observe(root,config){options=config;}takeRecords(){return [];}disconnect(){}}};win.top=win;
 const document={defaultView:win,location:{origin,href:origin+'/'},documentElement,querySelectorAll:()=>[sidebar],addEventListener(){},removeEventListener(){}};
 const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path,sendMessage:message=>{sent.push(message);return Promise.resolve();},onMessage:{addListener:fn=>{listener=fn;},removeListener(){listener=null;}}};
 const stop=installTemporaryNativeNavigation({document,runtime,origin,profile:{id:'chatgpt-zh-desktop-observed-20261018',regions:{projects:'nav',history:'nav'}}});
 const emit=record=>{if(record.type==='attributes'&&(!options.attributes||options.attributeFilter&&!options.attributeFilter.includes(record.attributeName)))return;if(record.type==='childList'&&!options.childList)return;callback([{removedNodes:[],addedNodes:[],...record}]);};
 const request=()=>{let result;listener({v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},{id:runtime.id,url:runtime.getURL('status.html')},value=>{result=value;});return result;};
 return {stop,sent,request,attribute(name){visible=false;emit({type:'attributes',attributeName:name,target:disclosure});},add(){const nav=newNav();navs.push(nav);emit({type:'childList',target:disclosure,addedNodes:[nav]});},replace(){const removed=navs;navs=[newNav()];emit({type:'childList',target:disclosure,removedNodes:removed,addedNodes:navs});},unrelated(){emit({type:'childList',target:bodyContent,addedNodes:[element(bodyContent)]});emit({type:'attributes',target:bodyContent,attributeName:'class'});}};
}
const invalidated={v:1,type:'HOST_TEMPORARY_NATIVE_INVALIDATED'};
for(const attribute of ['open','aria-expanded','data-state'])test('native disclosure '+attribute+' change clears snapshot before explicit reread',t=>{
 const f=fixture();t.after(f.stop);assert.equal(f.request().items.length,1);f.attribute(attribute);assert.deepEqual([...f.sent],[invalidated]);assert.equal(f.request().items.length,0);f.attribute(attribute);assert.deepEqual([...f.sent],[invalidated,invalidated]);
});
for(const change of ['add','replace'])test('validated sidebar '+change+' nav invalidates without inspecting reading content',t=>{
 const f=fixture();t.after(f.stop);assert.equal(f.request().items.length,1);f[change]();assert.deepEqual([...f.sent],[invalidated]);assert.equal(f.request().items.length,1);
});
test('first nav added after empty snapshot invalidates and explicit reread discovers Project',t=>{
 const f=fixture({empty:true});t.after(f.stop);assert.equal(f.request().items.length,0);f.add();assert.deepEqual([...f.sent],[invalidated]);assert.equal(f.request().items.length,1);
});
test('unrelated reading-region child and attribute mutations do not clear native snapshot',t=>{
 const f=fixture();t.after(f.stop);f.request();f.unrelated();assert.deepEqual([...f.sent],[]);
});
