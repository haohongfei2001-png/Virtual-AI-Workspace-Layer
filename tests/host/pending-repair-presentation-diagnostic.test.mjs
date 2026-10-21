import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pendingRepairPresentationSnapshot} from './existing-source-pending-repair-journey.mjs';
function snapshot({open=0,returns=[],dialog=false,popovers=[],account=null,model=null}={}){
 const selectors={'[data-va-owned]:popover-open':Array(open).fill({}),'iframe[data-va-owned]':[], 'button[aria-label="返回工作空间"]':returns,'dialog:modal':dialog?[{}]:[],':popover-open':popovers};
 const ctx={document:{visibilityState:'visible',hasFocus:()=>true,querySelectorAll:s=>{assert(s in selectors,s);return selectors[s];},querySelector:s=>{if(s==='#account-button')return account;if(s==='#model-button')return model;assert.equal(s,'#native-dialog[open]');return dialog?{}:null;}},getComputedStyle:n=>({display:n.hidden?'none':'block',visibility:'visible'})};
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+pendingRepairPresentationSnapshot.toString()+')()',ctx)));
}
const button=(patch={})=>({isConnected:true,disabled:false,getBoundingClientRect:()=>({width:24,height:24}),...patch});
test('missing return and closed presentation are distinguishable without pending state',()=>{const result=snapshot();assert.equal(result.returnControls,0);assert.equal(result.ownedOpen,0);assert.equal(result.nativeDialogOpen,false);});
test('actual hidden, disabled and visible return controls remain distinct',()=>{const result=snapshot({returns:[button(),button({hidden:true}),button({disabled:true})]});assert.equal(result.returnControls,3);assert.equal(result.returnVisible,2);assert.equal(result.returnDisabled,1);});
test('native layer and owned-open observations do not manufacture readiness',()=>{const result=snapshot({open:2,dialog:true,popovers:[{hasAttribute:()=>true},{hasAttribute:()=>false}]});assert.equal(result.ownedOpen,2);assert.equal(result.nativeDialogOpen,true);assert.equal(result.nativeModalCount,1);assert.equal(result.nativePopoverCount,1);});
test('diagnostic caps DOM counts and inspects only first eight controls',()=>{const result=snapshot({open:100,returns:Array(100).fill(button())});assert.equal(result.ownedOpen,64);assert.equal(result.returnControls,64);assert.equal(result.returnVisible,8);assert(!JSON.stringify(result).includes('grant'));});
test('failure-only presentation read is separately bounded and never retries native send',async()=>{const source=await readFile(new URL('./existing-source-pending-repair-journey.mjs',import.meta.url),'utf8');assert(source.includes('pendingDiagnosticDeadline(()=>a.evaluate(pendingRepairPresentationSnapshot),{timeoutMs:1000})'));assert(source.includes("'workspace-return'"));assert(source.includes("stage('PRE_SECOND_BUDGET');await readCapacity();"));assert(!pendingRepairPresentationSnapshot.toString().includes('.click('));});

test('failure before inspector distinguishes masked sidebar account from live header control',()=>{const value=snapshot({open:2,account:button({hidden:true}),model:button()});assert.equal(value.accountPresent,true);assert.equal(value.accountVisible,false);assert.equal(value.modelVisible,true);});
