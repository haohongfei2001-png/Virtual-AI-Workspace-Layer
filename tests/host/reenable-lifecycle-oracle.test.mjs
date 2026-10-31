import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./reenable-package-mv3-browser.mjs',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const privateCode=extract(' async function privateAbsent(){',' let absence;');
function frame({url='about:blank',privatePresent=true,detached=false,unreadable=false}={}){return {url:()=>url,isDetached:()=>detached,evaluate:async()=>{if(unreadable)throw Error('unreadable');return {reachable:true,privatePresent};}};}
function inspect(oldFrames,currentFrames){const context=vm.createContext({assert,oldFrames,frameURLs:['chrome-extension://test/workspace.html'],page:{frames:()=>currentFrames,locator:()=>({evaluateAll:async()=>0})}});return vm.runInContext(privateCode+';privateAbsent()',context);}
test('retained private frame cannot escape the reenable audit by changing its URL',async()=>{const old=frame();const result=await inspect([old],[old]);assert.equal(result.privateProjectionAbsent,false);assert.equal(result.frames.length,1);});
test('connected unreadable old frame is an inspection failure, not privacy absence',async()=>{await assert.rejects(inspect([frame({unreadable:true})],[]),/unreadable/);});
test('detached old frame is absent; same frame is inspected only once',async()=>{let calls=0;const old=frame({url:'chrome-extension://test/workspace.html',privatePresent:false});old.evaluate=async()=>{calls++;return {privatePresent:false};};assert.equal((await inspect([old],[old])).privateProjectionAbsent,true);assert.equal(calls,1);assert.equal((await inspect([frame({detached:true})],[])).privateProjectionAbsent,true);});
const nativeCode=extract(' async function nativeState(suffix){',' const disabledNative=');
const visible={visibility:'visible',interactivity:'auto',htmlInert:false};
for(const broken of [null,'reading','history','inert','htmlInert','open','after-input'])test('native lifecycle checks cleanup before input: '+broken,async()=>{
 let evaluations=0,inputs=0;
 const natural={openOwned:broken==='open'?1:0,reading:{...visible},history:{...visible}};
 if(broken==='reading'||broken==='history')natural[broken].visibility='hidden';
 if(broken==='inert')natural.history.interactivity='inert';
 if(broken==='htmlInert')natural.reading.htmlInert=true;
 const context=vm.createContext({assert,originalURL:'https://fixture/',page:{url:()=> 'https://fixture/',locator:()=>({press:async()=>{inputs++;},pressSequentially:async()=>{inputs++;}}),evaluate:async()=>evaluations++===0?natural:({nativeOperable:true,sameDocument:true,pageHides:0,cleanLayout:broken!=='after-input'})}});
 const result=vm.runInContext(nativeCode+";nativeState('_TEST')",context);
 if(broken){await assert.rejects(result);assert.equal(inputs,broken==='after-input'?2:0);}else{assert.equal((await result).cleanLayout,true);assert.equal(inputs,2);}
});
