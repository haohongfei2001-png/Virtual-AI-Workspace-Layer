import test from 'node:test';import assert from 'node:assert/strict';
import {assertRecoveryNativeLinkSample} from './recovery-native-link-observation.mjs';
const ref={id:'synthetic-current',nativeUrl:'https://chatgpt.com/c/synthetic-current'};
const good=()=>({count:1,ownerDocument:true,connected:true,visible:true,refId:ref.id,list:'unknown',href:ref.nativeUrl,ariaDisabled:null,containsProTitle:false});
test('first enabled snapshot retains exact URL and all original safety facts',()=>assert.doesNotThrow(()=>assertRecoveryNativeLinkSample(good(),ref)));
for(const [field,value] of [['href',null],['href','https://chatgpt.com/c/wrong'],['containsProTitle',true],['containsProTitle',undefined],['count',2],['ownerDocument',false],['connected',false],['visible',false],['refId','wrong'],['list','noProject'],['ariaDisabled','true']])test('first enabled '+field+'='+String(value)+' fails immediately, without accepting a later sample',()=>{
 const first={...good(),[field]:value};assert.throws(()=>assertRecoveryNativeLinkSample(first,ref));
 assert.doesNotThrow(()=>assertRecoveryNativeLinkSample(good(),ref));assert.throws(()=>assertRecoveryNativeLinkSample(first,ref));
});
