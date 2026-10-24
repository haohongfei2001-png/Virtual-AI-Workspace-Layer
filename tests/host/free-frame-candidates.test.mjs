import test from 'node:test';import assert from 'node:assert/strict';import {createFreeFrameCandidates} from '../../src/host/free-frame-candidates.mjs';
// Actual renderer with explicit synthetic DOM/event doubles; not trusted-browser certification.
function fixture(onPageRequest=()=>{}){class E{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};}append(...ns){for(const n of ns){n.parent=this;this.children.push(n);}}setAttribute(k,v){this.attrs[k]=v;}attachShadow(){this.shadowRoot=new E('shadow');this.shadowRoot.host=this;return this.shadowRoot;}focus(options){let n=this;while(n&&n.tag!=='shadow')n=n.parent;if(n){n.activeElement=this;doc.activeElement=n.host;}this.focusOptions=options;}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}addEventListener(k,f){this.handlers[k]=f;}all(){return [this,...this.children.flatMap(n=>n.all()),...(this.shadowRoot?.all()??[])];}}const root=new E('main'),calls=[],presentations=[],doc={createElement:t=>new E(t),activeElement:null};let action=async()=>({ok:true});const ui=createFreeFrameCandidates({document:doc,container:root,onPageRequest,onActivate:(k,p)=>{calls.push(k);presentations.push(p);return action(k,p);}});return {ui,root,calls,doc,presentations,list:()=>root.all().find(n=>n.tag==='ul'),shadow:()=>root.children[0]?.shadowRoot,setAction:f=>action=f,pageButtons:()=>root.all().filter(n=>n.tag==='button'&&!n.attrs['data-candidate-key']),buttons:()=>root.all().filter(n=>n.tag==='button'&&n.attrs['data-candidate-key']),text:()=>root.all().filter(n=>n.tag!=='style').map(n=>n.textContent).join(' ')};}
const item=(key='one')=>({renderKey:'candidate:'+key,nativeTitle:'同名项目',titleState:'exact',available:true,reason:null});const drain=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('same native names remain distinct temporary buttons without fabricated project identity',()=>{const f=fixture();f.ui.update([item(),item('two')]);assert.equal(f.buttons().length,2);assert(f.text().includes('待识别的项目'));assert.deepEqual(f.buttons().map(n=>n.attrs['data-candidate-key']),['candidate:one','candidate:two']);assert.equal(f.calls.length,0);});
test('only trusted click dispatches once; pending and unknown result never auto-retry',async()=>{const f=fixture();let finish;f.setAction(()=>new Promise(r=>finish=r));f.ui.update([item()]);const b=f.buttons()[0];await b.handlers.click({isTrusted:false});assert.equal(f.calls.length,0);void b.handlers.click({isTrusted:true});void b.handlers.click({isTrusted:true});assert.deepEqual(f.calls,['candidate:one']);assert(b.disabled);finish({ok:false});await drain();await b.handlers.click({isTrusted:true});assert.equal(f.calls.length,1);assert(f.text().includes('结果未确认'));});
test('old row events and delayed results cannot act on replacement generation',async()=>{const f=fixture();let finish;f.setAction(()=>new Promise(r=>finish=r));f.ui.update([item()]);const b=f.buttons()[0];void b.handlers.click({isTrusted:true});f.ui.update([item('two')]);const before=f.text();finish({ok:true});await drain();assert.equal(f.text(),before);await b.handlers.click({isTrusted:true});assert.equal(f.calls.length,1);});
test('unavailable remains visible and cannot call native action',async()=>{const f=fixture();f.ui.update([{...item(),available:false,reason:'unsaved-draft'}]);assert(f.buttons()[0].disabled);assert(f.text().includes('未发送内容'));await f.buttons()[0].handlers.click({isTrusted:true});assert.equal(f.calls.length,0);});
test('clear and stop remove all projection and reject stale clicks',async()=>{const f=fixture();f.ui.update([item()]);const b=f.buttons()[0];f.ui.clear();assert.equal(f.root.children.length,0);await b.handlers.click({isTrusted:true});assert.equal(f.calls.length,0);f.ui.update([item()]);f.ui.stop();f.ui.update([item('new')]);assert.equal(f.root.children.length,0);});
test('strict DTO bounds reject extras duplicate keys and title misrepresentation',()=>{for(const items of [[{...item(),id:'fake-project'}],[item(),item()],[{...item(),nativeTitle:'x'.repeat(201)}],[{...item(),titleState:'over-limit'}],[{...item(),renderKey:'project:one'}],Array.from({length:33},(_,i)=>item(String(i)))]){const f=fixture();assert.throws(()=>f.ui.update(items),/invalid-frame-candidates/);assert.equal(f.root.children.length,0);}});

test('only confirmed dispatch states report success, never transport ok alone',async()=>{for(const result of [{ok:true,state:'blocked'},{ok:true,state:'unconfirmed'},{ok:true},null,{state:'dispatched'},{ok:true,state:'already-current'}]){const f=fixture();f.setAction(async()=>result);f.ui.update([item()]);await f.buttons()[0].handlers.click({isTrusted:true});assert.equal(f.text().includes('已请求打开原生项目'),['dispatched','already-current'].includes(result?.state));assert.equal(f.calls.length,1);assert(f.buttons()[0].disabled);}});

const rows=(offset,count)=>Array.from({length:count},(_,i)=>item(String(offset+i)));
test('33, 65 and 256 candidates page forward and back without invoking native actions',async()=>{for(const total of [33,65,256,604,1000]){const requests=[],f=fixture(async offset=>{requests.push(offset);f.ui.update(rows(offset,Math.min(32,total-offset)),{offset,total,nextOffset:offset+32<total?offset+32:null});return {ok:true};});f.ui.update(rows(0,32),{offset:0,total,nextOffset:32});assert(f.pageButtons()[0].disabled);let offset=0;while(offset+32<total){await f.pageButtons()[1].handlers.click({isTrusted:true});offset+=32;assert.equal(f.buttons().length,Math.min(32,total-offset));assert(f.text().includes(` / ${total}`));}assert(f.pageButtons()[1].disabled);await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(requests.at(-1),offset-32);assert.equal(f.calls.length,0);}});
test('paging is trusted singleflight and old callbacks cannot update replacement controls',async()=>{let finish;const calls=[],f=fixture(offset=>{calls.push(offset);return new Promise(r=>finish=r);});f.ui.update(rows(0,32),{offset:0,total:65,nextOffset:32});const next=f.pageButtons()[1];await next.handlers.click({isTrusted:false});assert.equal(calls.length,0);void next.handlers.click({isTrusted:true});void next.handlers.click({isTrusted:true});assert.deepEqual(calls,[32]);assert.equal(next.disabled,false);assert.equal(next.attrs['aria-disabled'],'true');await f.buttons()[0].handlers.click({isTrusted:true});assert.equal(f.calls.length,0);f.ui.update(rows(32,32),{offset:32,total:65,nextOffset:64});const before=f.text();finish({ok:false});await drain();assert.equal(f.text(),before);assert.equal(f.pageButtons()[1].disabled,false);await next.handlers.click({isTrusted:true});assert.equal(calls.length,1);});
test('empty and shrunken inventories clear old page controls; stop rejects old pagination',async()=>{const calls=[],f=fixture(o=>calls.push(o));f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});const old=f.pageButtons()[0];f.ui.update([]);assert.equal(f.root.children.length,0);await old.handlers.click({isTrusted:true});assert.equal(calls.length,0);f.ui.update(rows(0,2),{offset:0,total:2,nextOffset:null});assert.equal(f.pageButtons().length,0);f.ui.stop();await old.handlers.click({isTrusted:true});assert.equal(calls.length,0);});
test('page metadata must describe an exact bounded contiguous page',()=>{for(const page of [{offset:1,total:33,nextOffset:33},{offset:0,total:Number.MAX_SAFE_INTEGER+1,nextOffset:32},{offset:0,total:33,nextOffset:null},{offset:0,total:32,nextOffset:32},{offset:32,total:32,nextOffset:null},{offset:0,total:33,nextOffset:64},{offset:0,total:32,nextOffset:null,scope:'fake'},{offset:256,total:256,nextOffset:null}]){const f=fixture();assert.throws(()=>f.ui.update(rows(0,32),page),/invalid-frame-candidate-page/);assert.equal(f.root.children.length,0);}const f=fixture();assert.throws(()=>f.ui.update(rows(0,1),{offset:0,total:33,nextOffset:1}),/invalid-frame-candidate-page/);});

test('trusted activation captures exact bounded presentation before disabling focused button',async()=>{const f=fixture();f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});const b=f.buttons()[0];b.focus();f.list().scrollTop=123.5;f.setAction(async(k,p)=>{assert(b.disabled);assert.deepEqual(p,{offset:32,scrollTop:123.5,focused:true});assert(Object.isFrozen(p));return {state:'dispatched'};});await b.handlers.click({isTrusted:true});assert.equal(f.presentations.length,1);});
test('same-page refresh preserves scroll and only the currently owned matching key focus',()=>{const f=fixture();f.ui.update([item(),item('two')]);f.buttons()[1].focus();f.list().scrollTop=81;f.ui.update([item('two'),item()]);assert.equal(f.list().scrollTop,81);assert.equal(f.shadow().activeElement,f.buttons()[0]);assert.deepEqual(f.buttons()[0].focusOptions,{preventScroll:true});f.doc.activeElement={tag:'native-editor'};f.ui.update([item('two'),item()]);assert.equal(f.shadow().activeElement,undefined);assert.equal(f.doc.activeElement.tag,'native-editor');assert.equal(f.list().scrollTop,81);});
test('missing focused candidate, page change and clear do not restore old focus or cross-page scroll',()=>{const f=fixture();f.ui.update([item(),item('two')]);f.buttons()[0].focus();f.list().scrollTop=80;f.ui.update([item('two')]);assert.equal(f.shadow().activeElement,undefined);f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});assert.equal(f.list().scrollTop,0);assert.equal(f.shadow().activeElement,undefined);f.list().scrollTop=40;f.ui.clear();f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});assert.equal(f.list().scrollTop,0);});
test('presentation scroll is finite bounded, unfocused is false, and stale events capture nothing',async()=>{for(const [input,want] of [[Infinity,0],[NaN,0],[-1,0],[1e8,1e7]]){const f=fixture();f.ui.update([item()]);const old=f.buttons()[0];f.list().scrollTop=input;await old.handlers.click({isTrusted:true});assert.deepEqual(f.presentations,[{offset:0,scrollTop:want,focused:false}]);f.ui.update([item('new')]);await old.handlers.click({isTrusted:true});assert.equal(f.presentations.length,1);}});

test('inactive iframe cannot restore or report focus even when its activeElement remains stale',async()=>{const f=fixture();f.ui.update([item()]);f.buttons()[0].focus();f.doc.hasFocus=()=>false;f.list().scrollTop=35;f.ui.update([item()]);assert.equal(f.shadow().activeElement,undefined);assert.equal(f.list().scrollTop,35);f.buttons()[0].focus();await f.buttons()[0].handlers.click({isTrusted:true});assert.equal(f.presentations[0].focused,false);});

test('error replaces candidates and invalidates their native activation handlers',async()=>{
 const requests=[],f=fixture(offset=>requests.push(offset));f.ui.update([item()]);const old=f.buttons()[0];
 f.ui.showError(64);assert.equal(f.buttons().length,0);assert.equal(f.pageButtons().length,1);assert.equal(f.pageButtons()[0].textContent,'重试');assert(f.text().includes('加载未完成'));assert.equal(f.ui.restorePosition({offset:64,scrollTop:12}),false);
 await old.handlers.click({isTrusted:true});assert.deepEqual(f.calls,[]);assert.deepEqual(requests,[]);
});
test('error retry requires trusted click, preserves requested offset and serializes attempts',async()=>{
 const requests=[];let finish;const f=fixture(offset=>{requests.push(offset);return new Promise(resolve=>finish=resolve);});f.ui.showError(608);const retry=f.pageButtons()[0];
 for(const event of [{isTrusted:false},{}, {isTrusted:1}])await retry.handlers.click(event);
 assert.deepEqual(requests,[]);const pending=retry.handlers.click({isTrusted:true});await retry.handlers.click({isTrusted:true});assert.deepEqual(requests,[608]);assert.equal(retry.disabled,false);assert.equal(retry.attrs['aria-disabled'],'true');assert(f.text().includes('正在加载'));
 finish({ok:false});await pending;assert.equal(retry.disabled,false);assert(f.text().includes('加载未完成'));
 const second=retry.handlers.click({isTrusted:true});assert.deepEqual(requests,[608,608]);finish({ok:false});await second;assert.deepEqual(f.calls,[]);
});
test('rejected page load remains explicitly retryable without automatic requests',async()=>{
 let requests=0;const f=fixture(async()=>{requests++;throw Error('transport');});f.ui.showError(0);const retry=f.pageButtons()[0];
 await retry.handlers.click({isTrusted:true});await drain();assert.equal(requests,1);assert.equal(retry.disabled,false);assert(f.text().includes('加载未完成'));
 await retry.handlers.click({isTrusted:true});assert.equal(requests,2);
});
for(const replacement of ['clear','stop','update','showError'])test(`error retry and delayed result cannot affect ${replacement} generation`,async()=>{
 let finish;const requests=[],f=fixture(offset=>{requests.push(offset);return new Promise(resolve=>finish=resolve);});f.ui.showError(32);const old=f.pageButtons()[0];const pending=old.handlers.click({isTrusted:true});
 if(replacement==='update')f.ui.update([item('fresh')]);else if(replacement==='showError')f.ui.showError(64);else f.ui[replacement]();
 const before=f.text();finish({ok:false});await pending;assert.equal(f.text(),before);await old.handlers.click({isTrusted:true});assert.deepEqual(requests,[32]);
 if(replacement==='stop'){f.ui.showError(0);assert.equal(f.root.children.length,0);}
 if(replacement==='showError')assert.equal(f.pageButtons()[0].disabled,false);
});
test('successful retry may render updated page without its old finally overwriting it',async()=>{
 const f=fixture(async offset=>{f.ui.update(rows(offset,1),{offset,total:offset+1,nextOffset:null});return {ok:true};});f.ui.showError(32);await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.buttons()[0].attrs['data-candidate-key'],'candidate:32');assert.equal(f.text().includes('加载未完成'),false);
});
test('error offset validation leaves existing content untouched',()=>{
 const f=fixture();f.ui.update([item()]);const before=f.text();for(const offset of [-32,1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'32',null,undefined]){assert.throws(()=>f.ui.showError(offset),/invalid-candidate-offset/);assert.equal(f.text(),before);}
});

test('focused candidate pager survives same-page observation and successful forward/back paging',async()=>{
 const f=fixture(async offset=>{f.ui.update(rows(offset,Math.min(32,65-offset)),{offset,total:65,nextOffset:offset+32<65?offset+32:null});return {ok:true};});
 f.ui.update(rows(0,32),{offset:0,total:65,nextOffset:32});f.pageButtons()[1].focus();
 f.ui.update(rows(0,32),{offset:0,total:65,nextOffset:32});assert.equal(f.shadow().activeElement,f.pageButtons()[1]);
 await f.pageButtons()[1].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.pageButtons()[1]);
 await f.pageButtons()[1].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.buttons()[0],'last page focuses usable content instead of disabled next');
 f.pageButtons()[0].focus();await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.pageButtons()[0]);
 await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.buttons()[0],'first page focuses content instead of disabled previous');
 assert.equal(f.calls.length,0);
});
test('failed focused page request transfers to retry and successful retry restores content',async()=>{
 let fail=true;const f=fixture(async offset=>{if(fail)f.ui.showError(offset);else f.ui.update(rows(offset,1),{offset,total:33,nextOffset:null});return {ok:!fail};});
 f.ui.update(rows(0,32),{offset:0,total:33,nextOffset:32});f.pageButtons()[1].focus();await f.pageButtons()[1].handlers.click({isTrusted:true});
 assert.equal(f.shadow().activeElement,f.pageButtons()[0]);fail=false;await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.buttons()[0]);assert.equal(f.calls.length,0);
});
for(const destination of ['native','sibling','clear'])test('pending candidate page never reclaims focus after '+destination,async()=>{
 let finish;const f=fixture(()=>new Promise(r=>finish=r));f.ui.update(rows(0,32),{offset:0,total:33,nextOffset:32});f.pageButtons()[1].focus();const request=f.pageButtons()[1].handlers.click({isTrusted:true});
 if(destination==='native')f.doc.activeElement={tag:'native-input'};else if(destination==='sibling')f.doc.hasFocus=()=>false;else f.ui.clear();
 f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});finish({ok:true});await request;assert.equal(f.shadow().activeElement,undefined);assert.equal(f.calls.length,0);
});
test('retry failure preserves retry focus; disabled-only page focuses its heading',async()=>{
 let failed=true;const f=fixture(async offset=>{if(failed)f.ui.showError(offset);else f.ui.update([{...item('last'),available:false}],{offset:32,total:33,nextOffset:null});});
 f.ui.showError(32);f.pageButtons()[0].focus();await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement,f.pageButtons()[0]);
 failed=false;await f.pageButtons()[0].handlers.click({isTrusted:true});assert.equal(f.shadow().activeElement.tag,'h2');assert.equal(f.shadow().activeElement.tabIndex,-1);assert.equal(f.calls.length,0);
});
test('error panel cannot accept a saved list scroll or reclaim external focus',()=>{
 const f=fixture();f.ui.showError(32);f.pageButtons()[0].focus();f.doc.activeElement={tag:'native-input'};f.ui.showError(32);assert.equal(f.shadow().activeElement,undefined);assert.equal(f.ui.restorePosition({offset:32,scrollTop:8}),false);
});

test('an explicitly empty page needs no scroll restoration but clear and error cannot acknowledge it',()=>{const f=fixture();assert.equal(f.ui.restorePosition({offset:0,scrollTop:13}),false);f.ui.update([]);assert.equal(f.ui.restorePosition({offset:0,scrollTop:13}),true);assert.equal(f.ui.restorePosition({offset:32,scrollTop:13}),false);assert.equal(f.ui.restorePosition({offset:0,scrollTop:NaN}),false);f.ui.clear();assert.equal(f.ui.restorePosition({offset:0,scrollTop:13}),false);f.ui.update([]);f.ui.showError(0);assert.equal(f.ui.restorePosition({offset:0,scrollTop:13}),false);});

test('hidden same-page replacements retain measured position until layout, without polling',()=>{
 const f=fixture(),observers=[];let visible=true;const create=f.doc.createElement;
 f.doc.createElement=tag=>{const n=create(tag);if(tag==='ul'){let scroll=0;n.getClientRects=()=>visible?[{}]:[];Object.defineProperty(n,'scrollTop',{get:()=>visible?scroll:0,set:v=>{if(visible)scroll=v;}});}return n;};
 f.doc.defaultView={ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
 f.ui.update([item(),item('two')]);f.list().scrollTop=87;f.list().handlers.scroll();visible=false;
 f.ui.update([item('two'),item()]);const first=observers.at(-1);f.ui.update([item(),item('two')]);assert(first.disconnected);first.fn();assert.equal(f.list().scrollTop,0);
 visible=true;observers.at(-1).fn();assert.equal(f.list().scrollTop,87);assert(observers.at(-1).disconnected);
 f.list().scrollTop=19;f.list().handlers.scroll();f.ui.update([item(),item('two')]);assert.equal(f.list().scrollTop,19);
});
for(const exit of ['clear','stop','page'])test('late hidden layout callback cannot restore retired candidate page after '+exit,()=>{
 const f=fixture(),observers=[];let visible=true;const create=f.doc.createElement;
 f.doc.createElement=tag=>{const n=create(tag);if(tag==='ul')n.getClientRects=()=>visible?[{}]:[];return n;};
 f.doc.defaultView={ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
 f.ui.update(rows(0,32),{offset:0,total:33,nextOffset:32});f.ui.restorePosition({offset:0,scrollTop:41});visible=false;
 f.ui.update(rows(0,32),{offset:0,total:33,nextOffset:32});const old=f.list(),observer=observers.at(-1);old.scrollTop=0;
 if(exit==='page'){visible=true;f.ui.update(rows(32,1),{offset:32,total:33,nextOffset:null});}else f.ui[exit]();
 visible=true;observer.fn();assert(observer.disconnected);assert.equal(old.scrollTop,0);if(exit==='page')assert.equal(f.list().scrollTop,0);
});

for(const event of ['pointerdown','wheel','keydown'])test('user input cancels pending hidden layout restoration: '+event,()=>{
 const f=fixture(),observers=[];let visible=true;const create=f.doc.createElement;
 f.doc.createElement=tag=>{const n=create(tag);if(tag==='ul')n.getClientRects=()=>visible?[{}]:[];return n;};
 f.doc.defaultView={ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
 f.ui.update([item()]);f.ui.restorePosition({offset:0,scrollTop:41});visible=false;f.ui.update([item()]);visible=true;const list=f.list(),observer=observers.at(-1);list.scrollTop=9;
 list.handlers[event]({isTrusted:true});observer.fn();assert.equal(list.scrollTop,9);assert(observer.disconnected);f.ui.update([item()]);assert.equal(f.list().scrollTop,9);
});
