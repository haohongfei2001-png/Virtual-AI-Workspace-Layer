import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
const source=await readFile(new URL('../../extension/temporary-navigation.mjs',import.meta.url),'utf8');
const imports=["import {css} from '../src/navigation/styles.mjs';","import {createURLPolicy} from '../src/host/url-policy.mjs';","import {HOST_CONFIG} from './config.mjs';"];
let body=source;for(const line of imports){assert.equal(body.split(line).length,2);body=body.replace(line,'');}
const deadlineImport="import {withRequestDeadline} from '../src/data/request-deadline.mjs';";
if(body.includes(deadlineImport)){assert.equal(body.split(deadlineImport).length,2);body=body.replace(deadlineImport,'');}
assert(!/^import\s/m.test(body),'unrecognized production dependency needs explicit injection');
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const origin='https://chatgpt.com',route=origin+'/',frame={documentId:'document-A',url:route};
const reply=title=>({v:1,mode:'temporary-native-navigation',route,partial:false,items:[{kind:'conversation',title,href:origin+'/c/11111111-1111-4111-8111-111111111111'}]});
function fixture(){
 let at=0,next=0;const timers=new Map(),calls=[],events=new Map(),nodes=[];
 class Element {constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};this.textContent='';this.value='';this.disabled=false;nodes.push(this);}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}attachShadow(){return this.shadow=new Element('shadow');}setAttribute(k,v){this[k]=v;}addEventListener(k,f){this.events[k]=f;}click(){if(!this.disabled)this.events.click?.();}}
 const document={createElement:tag=>new Element(tag),body:new Element('body')};
 const event=name=>({addListener:f=>events.set(name,f),removeListener:f=>{if(events.get(name)===f)events.delete(name);}});
 const call=(kind,args)=>{const d=deferred();calls.push({kind,args,...d});return d.promise;};
 const chrome={tabs:{query:args=>call('query',args),sendMessage:(...args)=>call('send',args)},webNavigation:{getFrame:args=>call('frame',args),onCommitted:event('commit'),onHistoryStateUpdated:event('history')},runtime:{id:'extension',onMessage:event('message')}};
 const setTimeout=(fn,delay)=>{const id=++next;timers.set(id,{fn,at:at+delay});return id;},clearTimeout=id=>timers.delete(id);
 const context={document,chrome,window:{addEventListener:(name,f)=>events.set(name,f)},css:'',HOST_CONFIG:{origin,temporaryReadOnly:true},createURLPolicy,URL,TextEncoder,performance:{now:()=>at},setTimeout,clearTimeout};
 // Execute the actual deadline helper with the same synthetic monotonic clock.
 context.withRequestDeadline=(work,options={})=>withRequestDeadline(work,{now:()=>at,schedule:setTimeout,cancel:clearTimeout,...options});
 vm.runInNewContext(body,context,{filename:'extension/temporary-navigation.mjs'});
 const status=()=>nodes.find(n=>n.tag==='p'&&n.textContent.startsWith('正在读取'))??nodes.filter(n=>n.tag==='p')[2];
 const button=()=>nodes.find(n=>n.tag==='button');
 const text=()=>{const walk=n=>n.textContent+n.children.map(walk).join('')+(n.shadow?walk(n.shadow):'');return walk(document.body);};
 return {calls,button,status,text,jump:ms=>{at+=ms;},click:()=>button().click(),invalidate:()=>events.get('history')?.({tabId:1,frameId:0}),close:()=>events.get('pagehide')?.(),async advance(ms){at+=ms;for(const [id,t]of [...timers])if(t.at<=at){timers.delete(id);t.fn();}await drain();},async resolve(index,value){calls[index].resolve(value);await drain();}};
}
async function reach(f,stage){await drain();if(stage>=1)await f.resolve(0,[{id:1}]);if(stage>=2)await f.resolve(1,frame);if(stage>=3)await f.resolve(2,reply('Old title'));}
for(const [stage,name]of ['tabs.query','frame before send','sendMessage','frame after send'].entries())test(name+' pending expires within the same 1000 ms and late reply cannot continue',async()=>{
 const f=fixture();await reach(f,stage);assert.equal(f.calls.length,stage+1);assert.equal(f.button().disabled,true);await f.advance(1000);assert.equal(f.button().disabled,false);assert(!f.status().textContent.includes('正在读取'));const count=f.calls.length;await f.resolve(stage,stage===0?[{id:1}]:stage===2?reply('Old title'):frame);assert.equal(f.calls.length,count);assert(!f.text().includes('Old title'));
});
test('four awaits share one deadline rather than a fresh send-only window',async()=>{
 const f=fixture();await drain();await f.advance(300);await f.resolve(0,[{id:1}]);await f.advance(300);await f.resolve(1,frame);await f.advance(300);await f.resolve(2,reply('Old title'));assert.equal(f.calls.length,4);await f.advance(100);assert.equal(f.button().disabled,false);assert(!f.status().textContent.includes('正在读取'));await f.resolve(3,frame);assert(!f.text().includes('Old title'));
});
for(const action of ['invalidate','close'])test(action+' prevents a late pre-send frame result from dispatching',async()=>{
 const f=fixture();await reach(f,1);f[action]();await drain();if(action==='invalidate')assert.equal(f.button().disabled,false);await f.resolve(1,frame);assert.equal(f.calls.length,2);assert(!f.text().includes('Old title'));
});
test('old load finally cannot enable the button for a newer pending explicit reread',async()=>{
 const f=fixture();await reach(f,3);f.invalidate();await drain();assert.equal(f.button().disabled,false);f.click();await drain();assert.equal(f.calls.length,5);assert.equal(f.button().disabled,true);await f.resolve(3,frame);assert.equal(f.button().disabled,true);assert(!f.text().includes('Old title'));
});
test('navigation invalidation clears titles and permits one explicit fresh reread',async()=>{
 const f=fixture();await reach(f,3);await f.resolve(3,frame);assert(f.text().includes('Old title'));f.invalidate();assert(!f.text().includes('Old title'));assert.equal(f.button().disabled,false);f.click();await drain();await f.resolve(4,[{id:1}]);await f.resolve(5,frame);await f.resolve(6,reply('Fresh title'));await f.resolve(7,frame);assert(f.text().includes('Fresh title'));assert(!f.text().includes('Old title'));assert.equal(f.calls.length,8);
});

for(const stage of [0,1,2,3])test('overdue phase '+stage+' reply is rejected even before delayed timer fires',async()=>{
 const f=fixture();await reach(f,stage);const count=f.calls.length;f.jump(1000);await f.resolve(stage,stage===0?[{id:1}]:stage===2?reply('Old title'):frame);assert.equal(f.calls.length,count);assert(!f.text().includes('Old title'));assert.equal(f.button().disabled,false);assert(!f.status().textContent.includes('正在读取'));
});
test('obsolete load timer cannot clear or unlock newer explicit read',async()=>{
 const f=fixture();await reach(f,1);await f.advance(100);f.invalidate();f.click();await drain();assert.equal(f.calls.length,3);assert.equal(f.button().disabled,true);await f.advance(900);assert.equal(f.button().disabled,true);assert(f.status().textContent.includes('正在读取'));await f.resolve(2,[{id:1}]);await f.resolve(3,frame);await f.resolve(4,reply('Fresh title'));await f.resolve(5,frame);assert(f.text().includes('Fresh title'));assert.equal(f.button().disabled,false);await f.resolve(1,frame);assert.equal(f.calls.length,6);assert(f.text().includes('Fresh title'));
});
