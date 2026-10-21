import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {waitPageCommandPrivateView} from './page-command-private-readiness.mjs';
function fixture({open=true,late=false,duplicate=false,foreign=false,returns=1,neverVisible=false}={}){
 let masks=open?2:0,clicks=0,reads=0;const stages=[];
 const title={count:async()=>1,first(){return this;},isVisible:async()=>masks===2&&!neverVisible};
 const frame={url:()=> 'chrome-extension://test/workspace.html',isDetached:()=>false,frameElement:async()=>({evaluate:async()=>!foreign,dispose:async()=>{}}),getByText:()=>title};
 const page={isClosed:()=>false,frames:()=>{if(late&&reads++===0)return [];return duplicate?[frame,frame]:[frame];},waitForFunction:async()=>{},locator:selector=>selector.includes('popover-open')?{count:async()=>masks}:{count:async()=>returns,click:async()=>{clicks++;masks=2;}}};
 return {page,stages,frame,get clicks(){return clicks;},options:{timeout:300,stage:s=>stages.push(s)}};
}
test('late navigated owned frame waits rather than asserting DOM iframe navigation synchronously',async()=>{const f=fixture({late:true});const r=await waitPageCommandPrivateView(f.page,'test',f.options);assert.equal(r.frame,f.frame);assert.equal(f.clicks,0);assert.equal(r.nativeReturnClicked,false);});
test('authorized but hidden private frame uses unique real return exactly once',async()=>{const f=fixture({open:false});const r=await waitPageCommandPrivateView(f.page,'test',f.options);assert.equal(f.clicks,1);assert.equal(r.nativeReturnClicked,true);assert.deepEqual(f.stages,['await-owned-private-frame','await-private-presentation','native-return-once','verify-visible-private-view']);});
for(const [options,message]of [[{duplicate:true},/ambiguous-owned/],[{foreign:true},/foreign-workspace/],[{open:false,returns:2},/ambiguous-or-missing/],[{open:false,returns:0},/ambiguous-or-missing/]])test('no action on invalid readiness '+JSON.stringify(options),async()=>{const f=fixture(options);await assert.rejects(waitPageCommandPrivateView(f.page,'test',f.options),message);assert.equal(f.clicks,0);});
test('failed presentation never retries native return or extends shared deadline',async()=>{const f=fixture({open:false,neverVisible:true});await assert.rejects(waitPageCommandPrivateView(f.page,'test',{...f.options,timeout:60}),/deadline|timeout/);assert.equal(f.clicks,1);});
test('runner starts attack network baseline only after genuine private view and stable IDB',async()=>{const source=await readFile(new URL('./page-command-native-fetch-package-browser.mjs',import.meta.url),'utf8');const ready=source.indexOf('await waitPageCommandPrivateView'),db=source.indexOf("assert(before,'private IDB did not settle')"),baseline=source.indexOf('const requestStart=requests.length');assert(ready>0&&db>ready&&baseline>db);assert(!source.includes('assert(workspace)'));assert(source.includes('timeout:15000,stage:'));assert(source.includes('report.unexpectedRequests=requests.length-requestStart'));});
