import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readActiveLocalStatus} from '../../src/host/local-status.mjs';
const source=readFileSync(new URL('../../extension/status.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../../extension/status.html',import.meta.url),'utf8');
const importLine="import {HOST_CONFIG} from './config.mjs';\nimport {readActiveLocalStatus} from '../src/host/local-status.mjs';\n";
assert(source.startsWith(importLine),'execute actual popup body after its exact imports');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function render(initial,browserLocal=false){
 let current=initial;const calls=[],node={textContent:''};
 const chrome={tabs:{query:async args=>{calls.push(['query',args]);return [{id:7,get title(){throw Error('PRIVATE_TITLE');},get url(){throw Error('PRIVATE_URL');}}];},sendMessage:async(...args)=>{calls.push(['send',...args]);return current;}}};
 const elements=[];
 const document={getElementById:id=>{assert.equal(id,'status');return node;},body:{append:e=>elements.push(e)},createElement:tag=>({tag,textContent:'',listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}})};
 chrome.runtime={sendMessage:async message=>{calls.push(['control',message]);return {ok:true};}};
 await new AsyncFunction('HOST_CONFIG','readActiveLocalStatus','chrome','document',source.slice(importLine.length))({browserLocal},readActiveLocalStatus,chrome,document);
 return {calls,node,elements,change:value=>{current=value;}};
}
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function assertSnapshotMeaning(text){
 const visible=text+' '+html.replace(/<[^>]*>/g,' ');
 assert.match(visible,/打开.{0,12}(?:时|状态)|本次(?:检查|读取)|状态快照/,'one-shot result must be explicitly presented as a snapshot');
 assert.match(visible,/(?:重新|再次).{0,8}打开|关闭.{0,8}打开/,'explain how the user can obtain a fresh local observation without polling');
}
for(const state of ['ready','dormant','connecting','waiting','verification-required','frame-blocked','unavailable'])test('actual popup renders '+state+' as a single local snapshot',async()=>{
 const f=await render({v:1,state});assert.equal(typeof f.node.textContent,'string');assert(f.node.textContent.length>0);assertSnapshotMeaning(f.node.textContent);
 assert.deepEqual(f.calls,[['query',{active:true,currentWindow:true}],['send',7,{v:1,type:'HOST_LOCAL_STATUS'},{frameId:0}]]);
 const before=f.node.textContent;f.change({v:1,state:state==='ready'?'waiting':'ready'});await drain();assert.equal(f.calls.length,2,'no polling or automatic refresh');assert.equal(f.node.textContent,before,'snapshot remains explicitly historical');
});
for(const response of [{v:1,state:'PRIVATE_TOKEN'},{v:1,state:'ready',title:'PRIVATE_TITLE'},{v:1,state:{scope:'PRIVATE_SCOPE'}},{v:1,state:'waiting',error:'PRIVATE_BODY'}])test('actual popup discards malformed or private response '+Object.keys(response).join(','),async()=>{
 const f=await render(response),fallback=await render({v:1,state:'unavailable'});assert.equal(f.node.textContent,fallback.node.textContent);assert(!f.node.textContent.includes('PRIVATE'));assert.equal(f.calls.length,2);assertSnapshotMeaning(f.node.textContent);
});

test('blocked Browser-Local popup explains frame failure and keeps locking available without offering re-unlock',async()=>{
 const f=await render({v:1,state:'frame-blocked'},true);
 assert.match(f.node.textContent,/框架被替换/);assert.match(f.node.textContent,/无需重新确认账号或重装扩展/);
 const [unlock,lock]=f.elements.filter(e=>e.tag==='button');
 assert.equal(unlock.disabled,true);assert.notEqual(lock.disabled,true);assert.equal(f.calls.length,2);
 lock.listeners.click();await drain();
 assert.deepEqual(f.calls.at(-1),['control',{v:1,type:'HOST_LOCAL_SPACE',action:'lock'}]);
 assert.equal(unlock.disabled,true);assert.equal(lock.disabled,false);
});
