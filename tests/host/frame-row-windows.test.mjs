import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFrameRowWindows,frameRowWindowKey} from '../../src/host/frame-row-windows.mjs';
const window=(extra={})=>({groupId:'P1',list:'current',rowOffset:0,rowLimit:5,...extra});
const rejects=value=>assert.throws(()=>validateFrameRowWindows(value));
test('valid windows preserve order and copy both the array and records',()=>{
 const input=[window(),window({groupId:null,list:'unknown',rowOffset:1000000,rowLimit:200,paged:true}),window({groupId:'P2',list:'old',rowLimit:197})];
 const result=validateFrameRowWindows(input);assert.deepEqual(result,input);assert.notEqual(result,input);for(let n=0;n<input.length;n++)assert.notEqual(result[n],input[n]);
 input[0].rowLimit=17;assert.equal(result[0].rowLimit,5);assert.deepEqual(validateFrameRowWindows([]),[]);
});
test('74 unique windows accepted, 75 rejected',()=>{const values=Array.from({length:74},(_,n)=>window({groupId:'P'+n}));assert.equal(validateFrameRowWindows(values).length,74);rejects([...values,window({groupId:'P74'})]);});
for(const rowLimit of [...Array.from({length:17},(_,n)=>5+12*n),200])test('original capacity '+rowLimit+' accepted',()=>{assert.equal(validateFrameRowWindows([window({rowLimit})])[0].rowLimit,rowLimit);});
for(const rowLimit of [0,1,4,6,16,18,196,198,199,201,Infinity,NaN,5.5,'5',null])test('invalid capacity '+String(rowLimit)+' rejected',()=>rejects([window({rowLimit})]));
for(const rowOffset of [0,1,999999,1000000])test('offset '+rowOffset+' accepted',()=>assert.equal(validateFrameRowWindows([window({rowOffset})])[0].rowOffset,rowOffset));
for(const rowOffset of [-1,1000001,Infinity,NaN,0.5,'0',null])test('invalid offset '+String(rowOffset)+' rejected',()=>rejects([window({rowOffset})]));
for(const list of ['unknown','noProject'])test('null group '+list+' accepted',()=>assert.deepEqual(validateFrameRowWindows([window({groupId:null,list})]),[window({groupId:null,list})]));
for(const list of ['current','old'])test('null group '+list+' rejected',()=>rejects([window({groupId:null,list})]));
for(const list of ['current','old','unknown'])test('Project '+list+' accepted',()=>assert.equal(validateFrameRowWindows([window({list})])[0].list,list));
for(const list of ['noProject','',null,'CURRENT','constructor'])test('invalid Project list '+String(list)+' rejected',()=>rejects([window({list})]));
for(const groupId of ['a','a_-9','a'.repeat(128)])test('safe project token length '+groupId.length+' accepted',()=>assert.equal(validateFrameRowWindows([window({groupId})])[0].groupId,groupId));
for(const groupId of ['', 'a'.repeat(129),'with space','é','a/b','__proto__','prototype','constructor',1,undefined,{},[]])test('invalid project token '+String(groupId)+' rejected',()=>rejects([window({groupId})]));
for(const paged of [false,null,0,1,'true',undefined])test('present invalid paged '+String(paged)+' rejected',()=>rejects([window({paged})]));
test('duplicate group/list rejected regardless of window dimensions',()=>{rejects([window(),window({rowOffset:17,rowLimit:17,paged:true})]);rejects([window({groupId:null,list:'unknown'}),window({groupId:null,list:'unknown'})]);assert.equal(validateFrameRowWindows([window(),window({list:'old'}),window({groupId:'P2'})]).length,3);});
for(const value of [null,undefined,{},'[]',new Set(),Object.assign(Object.create({}),{length:0})])test('non-array container rejected '+String(value),()=>rejects(value));
test('sparse, decorated and accessor arrays rejected without evaluating accessors',()=>{
 rejects(new Array(1));rejects(Object.assign([window()],{extra:true}));const symbol=Symbol('extra'),symbolArray=[window()];symbolArray[symbol]=1;rejects(symbolArray);
 const hidden=[window()];Object.defineProperty(hidden,'extra',{value:1});rejects(hidden);
 let reads=0;const accessor=[window()];Object.defineProperty(accessor,'0',{get(){reads++;return window();},enumerable:true});rejects(accessor);assert.equal(reads,0);
});
test('only exact plain enumerable data records accepted',()=>{
 for(const record of [null,[],new Date(),Object.assign(Object.create({}),window()),Object.assign(Object.create(null),window()),{...window(),extra:1}])rejects([record]);
 for(const key of ['groupId','list','rowOffset','rowLimit']){const missing=window();delete missing[key];rejects([missing]);const hidden=window();Object.defineProperty(hidden,key,{value:hidden[key],enumerable:false});rejects([hidden]);}
 const symbol=window();symbol[Symbol('extra')]=true;rejects([symbol]);const hidden=window();Object.defineProperty(hidden,'extra',{value:1});rejects([hidden]);
 let reads=0;const accessor=window();Object.defineProperty(accessor,'groupId',{get(){reads++;return 'P1';},enumerable:true});rejects([accessor]);assert.equal(reads,0);
});
test('window key distinguishes each canonical group/list and ignores presentation fields',()=>{
 const values=[window(),window({list:'old'}),window({list:'unknown'}),window({groupId:'P2'}),window({groupId:null,list:'unknown'}),window({groupId:null,list:'noProject'})];const keys=values.map(frameRowWindowKey);assert.equal(new Set(keys).size,values.length);assert.equal(frameRowWindowKey(window()),frameRowWindowKey(window({rowOffset:5,rowLimit:17,paged:true})));
});
