import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameSnippets} from '../../src/host/free-frame-snippets.mjs';
const C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222';
const item=(id='s',refId=C)=>({id,refId,preview:'selected preview',title:'Native title',nativeUrl:`https://chatgpt.com/c/${refId}`});
const reply=(items=[item()],total=items.length,offset=0)=>({ok:true,workspaceRevision:3,snippets:{items,total,offset,limit:12}});
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(ref={id:C,nativeUrl:`https://chatgpt.com/c/${C}`}){class E{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.textContent='';}append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.events[k]=f;}click(){if(!this.disabled)this.events.click?.();}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}all(){return [this,...this.children.flatMap(n=>n.all())];}}
 const container=new E('main'),calls=[];let handler=()=>reply(),closed=0;const ui=createFreeFrameSnippets({document:{createElement:t=>new E(t),defaultView:{crypto}},container,parentOrigin:'https://chatgpt.com',currentRef:()=>ref,request:async m=>{calls.push(m);return handler(m);},onClose:()=>closed++});return {ui,calls,container,set:f=>handler=f,button:s=>container.all().find(n=>n.tag==='button'&&n.textContent===s),text:()=>container.all().map(n=>n.textContent).join(' '),get closed(){return closed;}};}
test('open only lists; explicit save emits UUID and current ref, then reloads',async()=>{const f=fixture();await f.ui.open();assert.deepEqual(f.calls,[{type:'HOST_UI_SNIPPET_LIST',offset:0,limit:12}]);f.set(m=>m.type==='HOST_UI_SNIPPET_LIST'?reply():{ok:true});f.button('保存当前选区').click();await tick();assert.equal(f.calls[1].action,'save');assert.equal(f.calls[1].id,C);assert.equal(f.calls[1].expectedRevision,3);assert.match(f.calls[1].operationId,/^[a-f0-9-]{36}$/);assert.equal(f.calls.length,3);});
test('current locate and delete are siblings; cross conversation uses safe native link',async()=>{const f=fixture();f.set(()=>reply([item(),item('other',D)]));await f.ui.open();assert(f.button('定位片段'));const a=f.container.all().find(n=>n.tag==='a');assert.equal(a.attrs.href,`https://chatgpt.com/c/${D}`);assert.equal(a.attrs.target,'_blank');assert.equal(a.attrs.rel,'noopener noreferrer');assert.equal(a.children.length,0);f.set(()=>({ok:true}));f.button('定位片段').click();await tick();assert.equal(f.calls.at(-1).action,'locate');assert.equal(f.calls.at(-1).id,'s');});
test('no current conversation disables saving; unsafe URL and malformed preview refuse',async()=>{for(const bad of [false,true]){const f=fixture(null);f.set(()=>reply([{...item(),...(bad?{nativeUrl:'https://evil.test/c/'+C}:{preview:'x'.repeat(161)})}]));await f.ui.open();assert(f.button('保存当前选区').disabled);assert(f.button('重新加载'));assert(!f.container.all().some(n=>n.tag==='a'));}});
test('pagination sends bounded offset and preserves current list on error',async()=>{const f=fixture();f.set(()=>reply(Array.from({length:12},(_,i)=>item('s'+i)),13));await f.ui.open();f.set(()=>({ok:false,reason:'SECRET'}));f.button('下一页').click();await tick();assert.equal(f.calls.at(-1).offset,12);assert(f.text().includes('Native title'));assert(!f.text().includes('SECRET'));assert(f.button('返回工作空间'));});
test('pending mutations ignore repeated clicks; own notification reloads only after reply',async()=>{const f=fixture();await f.ui.open();let resolve;f.set(()=>new Promise(r=>resolve=r));const b=f.button('保存当前选区');b.click();b.click();f.ui.invalidate();f.ui.invalidate();assert.equal(f.calls.length,2);f.set(()=>reply());resolve({ok:true});await tick();assert.equal(f.calls.length,3);assert(f.button('定位片段'));});
test('stop and close reject late replies and stale controls',async()=>{for(const stop of [true,false]){const f=fixture();let resolve;f.set(()=>new Promise(r=>resolve=r));void f.ui.open();const back=f.button('返回工作空间');if(stop)f.ui.stop();else back.click();resolve(reply());await tick();back.click();assert.equal(f.container.children.length,0);assert.equal(f.closed,stop?0:1);}});
test('invalidated in-flight LIST never exposes stale preview and coalesces notifications into one fresh LIST',async()=>{
 const f=fixture(),pending=[];f.set(()=>new Promise(resolve=>pending.push(resolve)));void f.ui.open();
 for(let i=0;i<20;i++)f.ui.invalidate();assert.equal(f.calls.length,1);
 pending[0](reply([{...item('stale'),preview:'STALE_PREVIEW'}]));await tick();
 assert(!f.text().includes('STALE_PREVIEW'));assert.equal(f.calls.length,2,'one coalesced read after all notifications');
 assert.deepEqual(f.calls,[{type:'HOST_UI_SNIPPET_LIST',offset:0,limit:12},{type:'HOST_UI_SNIPPET_LIST',offset:0,limit:12}]);
 pending[1](reply([{...item('fresh'),preview:'FRESH_PREVIEW'}]));await tick();
 assert(f.text().includes('FRESH_PREVIEW'));assert(!f.text().includes('STALE_PREVIEW'));assert(!f.button('重新加载'));assert.equal(f.calls.length,2);
});
test('successful SAVE followed by invalidated LIST displays stored item with exactly one SAVE',async()=>{
 const f=fixture();f.set(()=>reply([]));await f.ui.open();const pending=[];
 f.set(message=>message.type==='HOST_UI_SNIPPET'?{ok:true}:new Promise(resolve=>pending.push(resolve)));
 f.button('保存当前选区').click();await tick();assert.equal(pending.length,1);
 for(let i=0;i<8;i++)f.ui.invalidate();pending[0](reply([]));await tick();
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_SNIPPET').length,1,'successful save is never replayed');
 assert.equal(pending.length,2,'only read side retries');
 pending[1](reply([{...item('stored'),preview:'STORED_SELECTION'}]));await tick();
 assert(f.text().includes('STORED_SELECTION'));assert(f.button('定位片段'));assert(!f.button('重新加载'));
 assert.deepEqual(f.calls.map(m=>m.type==='HOST_UI_SNIPPET'?m.action:'list'),['list','save','list','list']);
});
test('second invalidated LIST stops automatic rereads and exposes manual reload without stale preview',async()=>{
 const f=fixture(),pending=[];f.set(()=>new Promise(resolve=>pending.push(resolve)));void f.ui.open();
 f.ui.invalidate();pending[0](reply([{...item('first'),preview:'FIRST_STALE'}]));await tick();assert.equal(pending.length,2);
 for(let i=0;i<20;i++)f.ui.invalidate();pending[1](reply([{...item('second'),preview:'SECOND_STALE'}]));await tick();await tick();
 assert.equal(f.calls.length,2,'dirty retries have a fixed bound, not a notification-driven loop');
 assert(!f.text().includes('FIRST_STALE'));assert(!f.text().includes('SECOND_STALE'));assert(f.button('重新加载'));assert(!f.button('重新加载').disabled);
 f.button('重新加载').click();assert.equal(f.calls.length,3,'explicit human reload can start a new read');pending[2](reply());await tick();assert(f.text().includes('selected preview'));
});
for(const phase of ['initial','retry'])test('stop during dirty '+phase+' LIST prevents further requests and late rendering',async()=>{
 const f=fixture(),pending=[];f.set(()=>new Promise(resolve=>pending.push(resolve)));void f.ui.open();f.ui.invalidate();
 if(phase==='retry'){pending[0](reply());await tick();assert.equal(pending.length,2);f.ui.invalidate();}
 const count=f.calls.length;f.ui.stop();f.ui.invalidate();pending.at(-1)(reply());await tick();await tick();
 assert.equal(f.calls.length,count);assert.equal(f.container.children.length,0);assert(!f.text().includes('selected preview'));
});
test('failed SAVE warning survives successful idle invalidation LIST until an explicit new SAVE succeeds',async()=>{
 const f=fixture(),warning='保存结果未确认，请重新选中文本后重试。';f.set(()=>reply([]));await f.ui.open();
 f.set(message=>message.type==='HOST_UI_SNIPPET'?{ok:false,reason:'PRIVATE_FAILURE_DETAIL'}:reply([]));
 f.button('保存当前选区').click();await tick();assert(f.text().includes(warning));assert(!f.text().includes('PRIVATE_FAILURE_DETAIL'));
 const first=f.calls.find(message=>message.action==='save');assert(first);
 f.ui.invalidate();await tick();
 assert.equal(f.calls.filter(message=>message.action==='save').length,1,'idle notification must never replay a failed save');
 assert.deepEqual(f.calls.map(message=>message.action??message.type),['HOST_UI_SNIPPET_LIST','save','HOST_UI_SNIPPET_LIST']);
 assert(f.text().includes(warning),'successful empty read cannot certify or hide failed save');
 assert(f.container.all().some(node=>node.attrs.role==='alert'&&node.textContent.includes(warning)),'unconfirmed save stays an accessible alert');
 assert(!f.button('保存当前选区').disabled,'human may select again and deliberately save');
 f.set(message=>message.type==='HOST_UI_SNIPPET'?{ok:true}:reply([{...item('explicitly_saved'),preview:'EXPLICIT_NEW_SELECTION'}]));
 f.button('保存当前选区').click();await tick();
 const saves=f.calls.filter(message=>message.action==='save');assert.equal(saves.length,2);assert.notEqual(saves[1].operationId,first.operationId,'new user action has a fresh operation id');
 assert(f.text().includes('EXPLICIT_NEW_SELECTION'));assert(!f.text().includes(warning),'confirmed new save clears old warning');
 assert.deepEqual(f.calls.map(message=>message.action??message.type),['HOST_UI_SNIPPET_LIST','save','HOST_UI_SNIPPET_LIST','save','HOST_UI_SNIPPET_LIST']);
});
for(const action of ['locate','remove'])test('successful '+action+' of an existing snippet cannot clear an unrelated failed SAVE warning',async()=>{
 const f=fixture(),warning='保存结果未确认，请重新选中文本后重试。';await f.ui.open();
 f.set(message=>message.type==='HOST_UI_SNIPPET'?{ok:false}:reply());
 f.button('保存当前选区').click();await tick();assert(f.text().includes(warning));
 f.set(message=>message.type==='HOST_UI_SNIPPET'?{ok:true}:reply([]));
 f.button(action==='locate'?'定位片段':'删除片段').click();await tick();
 assert(f.text().includes(warning),'unrelated successful action does not resolve original uncertain save');
 assert(f.container.all().some(node=>node.attrs.role==='alert'&&node.textContent.includes(warning)));
 assert.deepEqual(f.calls.filter(message=>message.type==='HOST_UI_SNIPPET').map(message=>({action:message.action,id:message.id})),[{action:'save',id:C},{action,id:'s'}]);
 assert.equal(f.calls.filter(message=>message.action==='save').length,1,'other action does not replay save');
});

test('deleting the last item on a later page retains return offset across its own invalidation',async()=>{
 const f=fixture(),first=Array.from({length:12},(_,i)=>item('s'+i));f.set(()=>reply(first,13));await f.ui.open();
 f.set(()=>reply([item('last')],13,12));f.button('下一页').click();await tick();let finish;
 f.set(m=>m.type==='HOST_UI_SNIPPET'?new Promise(r=>finish=r):reply(first,12,m.offset));
 f.button('删除片段').click();f.ui.invalidate();f.ui.invalidate();finish({ok:true});await tick();
 assert.equal(f.calls.at(-1).offset,0,'successful removal returns to the preceding nonempty page');
 assert.equal(f.calls.filter(m=>m.action==='remove').length,1);assert.equal(f.calls.filter(m=>m.type==='HOST_UI_SNIPPET_LIST').length,3);assert(f.text().includes('共 12 个片段'));assert.equal(f.button('上一页').disabled,true);assert.equal(f.button('下一页').disabled,true);assert.equal(f.container.all().filter(n=>n.attrs['data-snippet-row']!==undefined).length,12);
});
test('unconfirmed last-page removal never automatically repeats the mutation or changes page',async()=>{
 const f=fixture();f.set(()=>reply(Array.from({length:12},(_,i)=>item('s'+i)),13));await f.ui.open();f.set(()=>reply([item('last')],13,12));f.button('下一页').click();await tick();let finish;f.set(()=>new Promise(r=>finish=r));f.button('删除片段').click();f.ui.invalidate();finish({ok:false});await tick();assert.equal(f.calls.length,3);assert(f.text().includes('操作结果未确认'));f.set(m=>reply([item('last')],13,m.offset));f.button('重新加载').click();await tick();assert.equal(f.calls.at(-1).offset,12);assert.equal(f.calls.filter(m=>m.action==='remove').length,1);
});
