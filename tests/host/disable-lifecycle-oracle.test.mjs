import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./disable-states-package-mv3-browser.mjs',import.meta.url),'utf8');
const start=source.indexOf(' async function absence('),end=source.indexOf(' async function naturalState(',start),code=source.slice(start,end);
function inspect({detached=false,unreadable=false}={}){const old={url:()=> 'about:blank#retained',isDetached:()=>detached,evaluate:async()=>{if(unreadable)throw Error('unreadable');return {privatePresent:true};}};const page={frames:()=>[old],locator:()=>({evaluateAll:async()=>0})};return vm.runInNewContext(code+';absence(page,[old])',{page,old,assert,frameURLs:['chrome-extension://test/workspace.html']});}
test('disable audit retains private frames whose URL changed',async()=>{assert.equal((await inspect()).privateProjectionAbsent,false);});
test('disable audit refuses unreadable connected old frames',async()=>{await assert.rejects(inspect({unreadable:true}),/unreadable/);});
test('disable audit accepts detached original frames',async()=>{assert.equal((await inspect({detached:true})).privateProjectionAbsent,true);});

const layoutCode=source.slice(source.indexOf(' async function naturalState('),source.indexOf(' async function surfaceState('));
for(const bad of [null,'reading','history','inert','htmlInert','open'])test('disable natural layout rejects '+bad,async()=>{
 const visible={visibility:'visible',interactivity:'auto',htmlInert:false},state={openOwned:bad==='open'?1:0,reading:{...visible},history:{...visible}};
 if(bad==='reading'||bad==='history')state[bad].visibility='hidden';if(bad==='inert')state.history.interactivity='inert';if(bad==='htmlInert')state.reading.htmlInert=true;
 const result=vm.runInNewContext(layoutCode+';naturalState(page)',{assert,page:{evaluate:async()=>state}});if(bad)await assert.rejects(result);else assert.equal((await result).openOwned,0);
});
test('disable natural cleanup is checked before generation stop or editor gestures',()=>{const probe=source.indexOf('const natural=await naturalState(page)'),stop=source.indexOf("await page.getByRole('button',{name:'Stop offline generation'"),input=source.indexOf("await page.locator('textarea').press('End')");assert(probe>0&&probe<stop&&probe<input);});
