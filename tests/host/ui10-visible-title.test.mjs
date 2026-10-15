import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForVisibleUi10Title,assertUi10TitleBox} from './ui10-visible-title.mjs';
function fixture(candidates){
 const calls=[];let filtered=false;
 const frame={locator(selector){calls.push(['locator',selector]);if(selector==='.workspace')return {getByText(title,options){calls.push(['text',title,options]);return exact;}};assert.equal(selector,'.workspace .theme-name:visible, .workspace .window-title:visible');return {visibleSelector:true};}};
 const exact={and(other){assert.equal(other.visibleSelector,true);filtered=true;return exact;},first(){const chosen=(filtered?candidates.filter(c=>c.visible):candidates)[0];return {waitFor:async options=>{calls.push(['wait',options]);if(!chosen?.visible)throw Error('hidden-title');},boundingBox:async()=>chosen.box};},evaluateAll:async()=>candidates};
 return {frame,calls,oldFirst:()=>exact.first()};
}
test('red reproduction: first exact hidden title shadows a later actual visible title',async()=>{const f=fixture([{visible:false,box:{width:0,height:22}},{visible:true,box:{width:40,height:22}}]);await assert.rejects(f.oldFirst().waitFor({state:'visible',timeout:15000}),/hidden-title/);});
test('visible filter precedes first and selects real positive-width title without changing deadline',async()=>{const f=fixture([{visible:false,box:{width:0,height:22}},{visible:true,box:{width:40,height:22}}]);const r=await waitForVisibleUi10Title(f.frame,'长中文');assert.equal(r.box.width,40);assert.equal(r.candidates.length,2);assert.deepEqual(f.calls.find(c=>c[0]==='wait'),['wait',{state:'visible',timeout:15000}]);assert.deepEqual(f.calls.find(c=>c[0]==='text'),['text','长中文',{exact:true}]);});
test('all hidden titles remain FAIL with candidate geometry attached',async()=>{const rows=[{visible:false,box:{width:0,height:22}}],f=fixture(rows);await assert.rejects(waitForVisibleUi10Title(f.frame,'长中文'),e=>e.message==='hidden-title'&&e.ui10TitleDiagnostics===rows);});
test('no matching actual title remains FAIL',async()=>{const f=fixture([]);await assert.rejects(waitForVisibleUi10Title(f.frame,'长中文'),/hidden-title/);});
test('zero area, missing and nonfinite text boxes cannot pass even when locator says visible',async()=>{for(const box of [null,{width:0,height:22},{width:40,height:0},{width:NaN,height:22},{width:40,height:Infinity}]){assert.throws(()=>assertUi10TitleBox(box));const f=fixture([{visible:true,box}]);await assert.rejects(waitForVisibleUi10Title(f.frame,'长中文'),/no-visible-text-box/);}});
test('original positive text box remains accepted',()=>assertUi10TitleBox({width:1,height:1}));
