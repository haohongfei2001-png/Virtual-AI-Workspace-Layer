import test from 'node:test';import assert from 'node:assert/strict';import {assertUi10ReadingReturn as reading,assertUi10CardHeadControls as headers} from './ui10-dom-contract.mjs';
const icon=()=>({count:1,text:'▦',label:'返回工作空间'}),menu=()=>({classes:['square','card-actions'],popup:'menu',expanded:'false'});
test('actual glyph with accessible name is icon-only return',()=>assert(reading(icon())));
for(const patch of [{count:0},{count:2},{text:''},{text:'返回工作空间'},{text:'▦ 返回工作空间'},{label:''},{label:'返回'}])test('reject invalid reading return '+JSON.stringify(patch),()=>assert.throws(()=>reading({...icon(),...patch})));
test('real card actions menus are not whole-card collapse',()=>{assert(headers([]));assert(headers([menu(),{...menu(),expanded:'true'},menu()]));});
for(const patch of [{classes:['square','collapse']},{popup:null},{popup:'dialog'},{classes:['card-actions']},{expanded:null}])test('reject illegal card header collapse '+JSON.stringify(patch),()=>assert.throws(()=>headers([{...menu(),...patch}])));
test('allowed menu does not hide extra illegal card collapse',()=>assert.throws(()=>headers([menu(),{classes:['collapse'],popup:null,expanded:'false'}])));
