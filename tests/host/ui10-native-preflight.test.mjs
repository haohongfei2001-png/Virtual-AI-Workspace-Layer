import test from 'node:test';
import assert from 'node:assert/strict';
import {assertUi10NativePreflight} from './ui10-native-preflight.mjs';
const sample=()=>({ownedSurfaces:0,viewport:{width:420,height:520},controls:Array.from({length:5},(_,i)=>({id:'control-'+i,rect:{left:10,top:100,right:100,bottom:130,width:90,height:30},hit:true,focused:true}))});
test('the native baseline accepts operable controls without extension nodes',()=>assert.equal(assertUi10NativePreflight(sample()).controls.length,5));
test('a native model button already clipped by the fixture cannot certify extension layout',()=>{const value=sample();value.controls[1].rect.right=500;assert.throws(()=>assertUi10NativePreflight(value),/native-control-outside-viewport/);});
test('visible controls still require hit testing and native focus',()=>{for(const key of ['hit','focused']){const value=sample();value.controls[2][key]=false;assert.throws(()=>assertUi10NativePreflight(value));}});
test('a populated extension baseline cannot replace the pre-extension gate',()=>{const value=sample();value.ownedSurfaces=1;assert.throws(()=>assertUi10NativePreflight(value),/precede extension/);});
