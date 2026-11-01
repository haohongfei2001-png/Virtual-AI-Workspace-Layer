import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installStartupSurfaceObserver} from './startup-surface-observer.mjs';
const origin='http://127.0.0.1:1234',extension='chrome-extension://'+'a'.repeat(32);
const selectors=['aside nav[aria-label="Chat history"]','main > header','main > section[aria-label="Conversation"]','main > form#composer','main > header > .navigation-slot'];
function fixture({url=origin,child=false,empty=false,broken=false}={}){
 const maps=new Map(),listeners=new Map(),observers=[],performanceObservers=[],owned=[];let time=0;
 const node=()=>({isConnected:true,children:[],contains(n){return n===this||this.children.includes(n);}});
 const roots=selectors.map(()=>node());if(!empty)selectors.forEach((s,i)=>maps.set(s,[roots[i]]));
 const add=(target,type,fn)=>{const key=target+':'+type,list=listeners.get(key)??[];list.push(fn);listeners.set(key,list);};
 const remove=(target,type,fn)=>listeners.set(target+':'+type,(listeners.get(target+':'+type)??[]).filter(f=>f!==fn));
 const document={visibilityState:'visible',querySelectorAll(s){if(broken)throw Error('PRIVATE text');if(s.includes('section[data-va-owned]'))return owned.filter(n=>!s.includes(':popover-open')||n.open);return maps.get(s)??[];},addEventListener:(t,f)=>add('doc',t,f),removeEventListener:(t,f)=>remove('doc',t,f)};
 class MutationObserver{constructor(callback){this.callback=callback;this.records=[];observers.push(this);}observe(target,options){this.target=target;this.options=options;}takeRecords(){return this.records.splice(0);}disconnect(){this.disconnected=true;}}
 class PerformanceObserver{constructor(callback){this.callback=callback;this.records=[];performanceObservers.push(this);}observe(){}takeRecords(){return this.records.splice(0);}disconnect(){this.disconnected=true;}}
 const globals={document,location:{origin:url},performance:{now:()=>++time},URL,structuredClone,MutationObserver,PerformanceObserver,addEventListener:(t,f)=>add('win',t,f),removeEventListener:(t,f)=>remove('win',t,f)};
 globals.self={};globals.top=child?{}:globals.self;const context=vm.createContext(globals);vm.runInContext(`(${installStartupSurfaceObserver.toString()})(${JSON.stringify({fixtureOrigin:origin,extensionOrigin:extension})})`,context);
 const fire=(type,fields={},target='doc')=>{for(const fn of [...(listeners.get(target+':'+type)??[])])fn(fields);};
 const surface=(name,src=extension+'/'+name+'.html')=>{const n={...node(),open:true,matches:s=>s==='section[data-va-owned][popover="manual"]',querySelectorAll:()=>[{getAttribute:()=>src}]};owned.push(n);return n;};
 return {context,document,roots,maps,observers,performanceObservers,listeners,fire,surface,finish:()=>context.__vaiwlOfflineStartup?.finish()};
}
const record=(target,type='childList',extras={})=>({target,type,addedNodes:[],removedNodes:[],...extras});

test('only exact loopback top document is observed',()=>{
 for(const options of [{url:'https://chatgpt.com'},{url:origin+'x'},{child:true}]){const f=fixture(options);assert.equal(f.finish(),undefined);assert.equal(f.observers.length,0);assert.equal(f.listeners.size,0);}
});
test('initial empty document and reading replacement retain structural ordering without text',()=>{
 const f=fixture({empty:true}),observer=f.observers[0];assert.equal(observer.target,f.document);
 f.maps.set(selectors[2],[f.roots[2]]);observer.callback([record({},'childList',{addedNodes:[f.roots[2]]})],observer);
 const child={textContent:'PRIVATE BODY',get id(){throw Error('must not read ID');}};f.roots[2].children.push(child);observer.callback([record(f.roots[2],'childList',{addedNodes:[child]})],observer);
 const result=f.finish(),changes=result.events.filter(e=>e.type==='regions');assert.equal(result.status,'COMPLETE_PASSIVE_TRACE');assert.equal(changes[0].changes[0].replaced,true);assert.equal(changes[1].changes[0].replaced,false);assert.equal(changes[0].regions.reading.generation,changes[1].regions.reading.generation);assert.equal(changes[1].phase,'callback');assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('synchronous close/open edges survive coalesced toggle and focus is only a fixed category',()=>{
 const f=fixture(),workspace=f.surface('workspace');f.surface('sidebar');const editor={value:'PRIVATE draft'};f.roots[3].children.push(editor);
 f.fire('focusin',{target:editor,isTrusted:true});f.fire('beforetoggle',{target:workspace,oldState:'open',newState:'closed',isTrusted:true});workspace.open=false;f.fire('beforetoggle',{target:workspace,oldState:'closed',newState:'open',isTrusted:true});workspace.open=true;f.fire('toggle',{target:workspace,oldState:'open',newState:'open',isTrusted:true});
 const result=f.finish(),focus=result.events.find(e=>e.type==='focusin'),edges=result.events.filter(e=>e.type==='beforetoggle');assert.equal(focus.category,'protected-composer');assert.deepEqual({...focus.surfaces},{workspace:1,sidebar:1,other:0});assert.deepEqual(edges.map(e=>[e.oldState,e.newState]),[['open','closed'],['closed','open']]);assert(!JSON.stringify(result).includes('draft'));
});
test('same-root attributes are recorded but values and foreign frame identity are excluded',()=>{
 const f=fixture(),foreign=f.surface('workspace','chrome-extension://'+'b'.repeat(32)+'/workspace.html');f.fire('beforetoggle',{target:foreign,oldState:'closed',newState:'open'});f.observers[0].callback([record(f.roots[2],'attributes',{attributeName:'style',oldValue:'PRIVATE style'})]);
 const result=f.finish();assert.equal(result.events[1].role,'other');assert.deepEqual(result.events.at(-1).changes[0].attributes,['style']);assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes('chrome-extension'));
});
test('synchronous focus sampling cannot consume a pending region replacement',()=>{
 const f=fixture(),old=f.roots[2],next={...old,children:[]};f.maps.set(selectors[2],[next]);
 f.fire('focusin',{target:f.roots[3],isTrusted:true});f.observers[0].callback([record({},'childList',{removedNodes:[old],addedNodes:[next]})]);
 const result=f.finish(),change=result.events.find(e=>e.type==='regions').changes.find(c=>c.region==='reading');assert.equal(change.replaced,true);
});
test('resource entries retain exact native route timing without URLs, queries or bodies',()=>{
 const f=fixture(),p=f.performanceObservers[0];p.callback({getEntries:()=>[{name:origin+'/native/route?path=PRIVATE',startTime:2,responseStart:3,responseEnd:4,duration:2},{name:'https://private.test/native/route'},{name:origin+'/other'}]});const result=f.finish(),entries=result.events.filter(e=>e.type==='native-route-resource');assert.equal(entries.length,1);assert.deepEqual(entries[0].timing,{startTime:2,responseStart:3,responseEnd:4,duration:2});assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('finish drains pending records once and detaches listeners; later callbacks cannot amend output',()=>{
 const f=fixture();f.observers[0].records.push(record(f.roots[2]));const first=f.finish();assert.equal(first.events.at(-1).phase,'drained');assert(f.observers[0].disconnected&&f.performanceObservers[0].disconnected);assert([...f.listeners.values()].every(list=>list.length===0));f.observers[0].callback([record(f.roots[3])]);first.events.length=0;assert(f.finish().events.length>0);assert.deepEqual(f.finish(),f.finish());
});
test('overflow, observation errors, installation errors and leaving document are incomplete',()=>{
 const f=fixture();for(let i=0;i<260;i++)f.fire('toggle',{});const result=f.finish();assert.equal(result.events.length,256);assert.equal(result.dropped,5);assert.equal(result.status,'INCOMPLETE');
 const bad=fixture();bad.observers[0].callback([{get target(){throw Error('PRIVATE');}}]);assert.deepEqual(bad.finish().issues,['observation-error']);assert.equal(fixture({broken:true}).finish().status,'INCOMPLETE');
 const left=fixture();left.fire('pagehide',{},'win');assert.deepEqual(left.finish().issues,['document-left']);assert(left.observers[0].disconnected);
});
