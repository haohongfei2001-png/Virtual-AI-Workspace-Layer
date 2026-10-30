import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createUi10OuterObservation,createUi10ChildObservation,observeUi10ShellConsistently,ui10ShellInconsistency} from './ui10-shell-observation.mjs';
import {assertUi10ShellBounds} from './ui10-matrix-contract.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const rect=(x,y,width,height)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});
function snapshot(){
 const parent={at:1,timeOrigin:1,viewport:{width:420,height:520},backend:'document-flow',identity:{document:true,frame:true,surface:true,close:true,exit:true},frame:rect(0,0,420,520),surface:rect(0,0,420,520),close:rect(392,4,24,24),closeHit:true,exitOpen:true,styles:{frame:{display:'block',visibility:'visible'},surface:{display:'flex',visibility:'visible'}},sequence:0,dropped:0,events:[]};
 return {before:clone(parent),after:clone(parent),final:clone(parent),child:{at:2,timeOrigin:2,role:'workspace',visibility:'visible',presence:{main:true,root:true,shadow:true,renderer:true},measurement:{width:420,height:520,document:{scrollWidth:420,scrollHeight:520},main:{y:0,height:520},scrollX:0,scrollY:0},controls:[],controlsDropped:0},current:{at:3,timeOrigin:2,identity:{document:true,main:true,root:true,shadow:true,renderer:true}}};
}
test('consistent shell is checked once with the inherited oracle and exact evidence limits',async()=>{
 let captures=0,checks=0;const sample=snapshot();
 const result=await observeUi10ShellConsistently(null,(...args)=>{checks++;assertUi10ShellBounds(...args);},{capture:async()=>{captures++;return sample;}});
 assert.equal(captures,1);assert.equal(checks,1);assert.equal(result.measurement,sample.child.measurement);
 assert.equal(result.observation.attempts[0].status,'PASS_CONSISTENT_SNAPSHOT');assert.equal(result.evidence,'SHELL_GEOMETRY_ONLY');assert.equal(result.fullV27Acceptance,'NOT_ESTABLISHED');
});
test('stable zero, overflow, or control obstruction fail immediately, even if a later sample would pass',async()=>{
 for(const change of [s=>s.child.measurement.main.height=0,s=>s.child.measurement.document.scrollWidth=422,s=>s.after.closeHit=false,s=>s.child.controls.push({rect:rect(392,4,24,24),visible:true})]){
  const bad=snapshot();change(bad);let captures=0;
  await assert.rejects(observeUi10ShellConsistently(null,assertUi10ShellBounds,{capture:async()=>++captures===1?bad:snapshot()}),error=>{assert.equal(error.ui10ShellDiagnostics.attempts.length,1);assert.deepEqual(error.ui10ShellDiagnostics.attempts[0].discardReasons,[]);assert.equal(error.ui10ShellDiagnostics.attempts[0].sample,bad);return true;});
  assert.equal(captures,1);
 }
});
test('only demonstrated parent change, toggle ABA, or child identity change discards the retained old sample',async()=>{
 for(const [change,reason]of [
  [s=>s.after.frame.x=2,'parent-geometry-changed'],
  [s=>{for(const p of [s.after,s.final]){p.sequence=2;p.events=[{sequence:1,oldState:'open',newState:'closed'},{sequence:2,oldState:'closed',newState:'open'}];}},'owned-beforetoggle-changed'],
  [s=>s.current.identity.renderer=false,'child-identity-changed'],
  [s=>s.final.identity.frame=false,'parent-identity-changed'],
 ]){
  const old=snapshot();old.child.measurement.main.height=0;change(old);let calls=0;
  const result=await observeUi10ShellConsistently(null,assertUi10ShellBounds,{capture:async()=>++calls===1?old:snapshot()});
  assert.equal(calls,2);assert.equal(result.observation.attempts[0].sample,old);assert.equal(old.child.measurement.main.height,0);
  assert.deepEqual(result.observation.attempts[0].discardReasons,[reason]);assert.equal(result.observation.old74FailureCause,'UNKNOWN');
 }
});
test('missing renderer, dropped evidence, or malformed identity cannot be called consistent',async()=>{
 for(const change of [s=>s.child.presence.renderer=false,s=>s.final.dropped=1,s=>s.child.controlsDropped=1,s=>s.current.identity={}]){
  const sample=snapshot();change(sample);let calls=0;
  await assert.rejects(observeUi10ShellConsistently(null,assertUi10ShellBounds,{capture:async()=>{calls++;return sample;}}));assert.equal(calls,1);
 }
});
test('three actual changes exhaust the one observation without a fourth opportunity',async()=>{
 let calls=0;await assert.rejects(observeUi10ShellConsistently(null,assertUi10ShellBounds,{capture:async()=>{calls++;const value=snapshot();value.final.sequence=1;return value;}}),error=>{assert.match(error.message,/attempt-limit/);assert.equal(error.ui10ShellDiagnostics.attempts.length,3);assert(error.ui10ShellDiagnostics.attempts.every(row=>row.status==='DISCARDED_INCONSISTENT_SNAPSHOT'));return true;});assert.equal(calls,3);
});
test('attempts share one elapsed budget and a hung read cannot extend it',async()=>{
 let clock=0,calls=0;await assert.rejects(observeUi10ShellConsistently(null,assertUi10ShellBounds,{now:()=>clock,capture:async()=>{calls++;clock+=3000;const value=snapshot();value.final.sequence=1;return value;}}),/observation-deadline/);assert.equal(calls,2);
 await assert.rejects(observeUi10ShellConsistently(null,assertUi10ShellBounds,{timeoutMs:10,capture:()=>new Promise(()=>{})}),error=>error.message==='ui10-shell-observation-deadline'&&error.ui10ShellDiagnostics.attempts.length===1);
});

/** Execute the real serialized callbacks in separate parent/child realms.
 * This small structural model has no actions, styles writes, or geometry waits. */
function realms(){
 const handles=[],listeners=new Set(),box=rect(0,0,420,520),buttonBox=rect(392,4,24,24),state={mainHeight:520,renderer:{isConnected:true},controlRects:[],source:'chrome-extension://fixture/workspace.html',exitOpen:true};
 const domRect=value=>({...value,toJSON(){return {...value};}});
 const parentDoc={elementFromPoint:()=>close,getElementById:id=>id==='fixture_exit'?exit:null};
 const surface={isConnected:true,hasAttribute:()=>false,getAttribute:key=>key==='data-va-owned'?'fixture':null,getBoundingClientRect:()=>domRect(box)};
 const exit={isConnected:true,hasAttribute:key=>key==='popover',getAttribute:key=>key==='data-va-owned'?'fixture':null,matches:()=>state.exitOpen,addEventListener(type,listener){assert.equal(type,'beforetoggle');listeners.add(listener);},removeEventListener(type,listener){assert.equal(type,'beforetoggle');listeners.delete(listener);}};
 const close={tagName:'BUTTON',isConnected:true,getAttribute:key=>key==='popovertarget'?'fixture_exit':null,getBoundingClientRect:()=>domRect(buttonBox)};
 const parentWindow={document:parentDoc,innerWidth:420,innerHeight:520,performance:{timeOrigin:1,now:()=>1},getComputedStyle:node=>({display:node===surface?'flex':'block',visibility:'visible'})};parentDoc.defaultView=parentWindow;
 const iframe={tagName:'IFRAME',isConnected:true,ownerDocument:parentDoc,parentElement:surface,previousElementSibling:close,contentWindow:{},getAttribute:key=>key==='src'?state.source:null,getBoundingClientRect:()=>domRect(box)};
 const shadow={querySelector:selector=>selector==='.workspace'?state.renderer:null},host={isConnected:true,shadowRoot:shadow,getAttribute:key=>key==='data-vaiwl-frame-role'?'workspace':null};
 const main={isConnected:true,querySelectorAll:selector=>selector==='[data-vaiwl-frame-role]'?[host]:[],getBoundingClientRect:()=>domRect(rect(0,0,420,state.mainHeight))};
 const childDoc={documentElement:{scrollWidth:420,scrollHeight:520},body:{dataset:{frameRole:'workspace'}},visibilityState:'visible',querySelector:selector=>selector==='main'?main:null,querySelectorAll:()=>state.controlRects.map(value=>({getBoundingClientRect:()=>domRect(value)}))};
 const parent=vm.createContext({}),child=vm.createContext({document:childDoc,performance:{timeOrigin:2,now:()=>1},innerWidth:420,innerHeight:520,scrollX:0,scrollY:0,getComputedStyle:()=>({display:'block',visibility:'visible'})});
 const execute=(realm,fn,value)=>{realm.argument=value;try{return vm.runInContext(`(${fn.toString()})(argument)`,realm);}finally{delete realm.argument;}};
 const handle=(value,realm,kind)=>{const h={kind,disposed:false,async evaluate(fn){return execute(realm,fn,value);},async dispose(){h.disposed=true;}};handles.push(h);return h;};
 const outerElement={kind:'element',disposed:false,async evaluateHandle(fn){return handle(execute(parent,fn,iframe),parent,'outer');},async dispose(){outerElement.disposed=true;}};
 const frame={async frameElement(){handles.push(outerElement);return outerElement;},async evaluateHandle(fn){return handle(execute(child,fn),child,'child');}};
 return {frame,state,listeners,handles,iframe,exit,shadow,host,main,parentDoc,childDoc,parent,child,execute,outerElement};
}
test('the actual parent listener catches trusted close/open ABA and never treats synthetic events as change',()=>{
 const f=realms(),observer=f.execute(f.parent,createUi10OuterObservation,f.iframe);
 for(const listener of f.listeners)listener({target:f.exit,isTrusted:false,oldState:'open',newState:'closed'});
 assert.equal(observer.read().sequence,0);
 for(const [oldState,newState]of [['open','closed'],['closed','open']])for(const listener of f.listeners)listener({target:f.exit,isTrusted:true,oldState,newState});
 const after=observer.read();assert.equal(after.sequence,2);assert.equal(after.exitOpen,observer.before.exitOpen);assert.deepEqual(clone(after.frame),clone(observer.before.frame));assert.equal(after.events.length,2);
 const sample=snapshot();Object.assign(sample,{before:clone(observer.before),after:clone(after),final:clone(after)});assert.deepEqual(ui10ShellInconsistency(sample),['owned-beforetoggle-changed']);
 observer.close();observer.close();assert.equal(f.listeners.size,0);
});
test('real child sampler retains shadow renderer identity and original control rectangles from its one task',()=>{
 const f=realms();f.state.controlRects=[rect(392,4,24,24)];const observation=f.execute(f.child,createUi10ChildObservation);
 assert.equal(observation.sample.presence.renderer,true);assert.equal(observation.current().identity.renderer,true);
 const previous=f.state.renderer;previous.isConnected=false;f.state.renderer={isConnected:true};f.state.controlRects=[];
 assert.equal(observation.current().identity.renderer,false);assert.equal(observation.sample.controls.length,1);assert.equal(observation.sample.controls[0].rect.left,392);
 f.state.renderer=null;const missing=f.execute(f.child,createUi10ChildObservation);assert.equal(missing.sample.presence.renderer,false);assert.equal(missing.current().identity.renderer,true);
});
test('real handle capture cleans every reference/listener on success and on stable-zero failure',async()=>{
 for(const zero of [false,true]){const f=realms();if(zero)f.state.mainHeight=0;
  const work=observeUi10ShellConsistently(f.frame,assertUi10ShellBounds);
  if(zero)await assert.rejects(work,error=>error.ui10ShellDiagnostics.attempts.length===1&&error.ui10ShellDiagnostics.attempts[0].sample.child.measurement.main.height===0);else await work;
  assert.equal(f.handles.length,3);assert(f.handles.every(handle=>handle.disposed));assert.equal(f.listeners.size,0);
 }
});
test('partial read and cleanup errors remain failures with bounded evidence and no new sampling',async()=>{
 const f=realms();f.frame.evaluateHandle=async()=>{throw Error('child-context-lost');};
 await assert.rejects(observeUi10ShellConsistently(f.frame,assertUi10ShellBounds),error=>error.message==='child-context-lost'&&!!error.ui10ShellDiagnostics.attempts[0].sample.before);
 assert(f.handles.every(handle=>handle.disposed));assert.equal(f.listeners.size,0);
 const g=realms(),dispose=g.outerElement.dispose;g.outerElement.dispose=async()=>{await dispose();throw Error('fixture-dispose-failed');};
 await assert.rejects(observeUi10ShellConsistently(g.frame,assertUi10ShellBounds),error=>error.message==='ui10-shell-cleanup-failed'&&error.ui10ShellDiagnostics.cleanupErrors.includes('fixture-dispose-failed'));
 assert.equal(g.listeners.size,0);
});
test('a parent handle delivered after timeout is cleaned without another sample or revived success',async()=>{
 const f=realms(),make=f.outerElement.evaluateHandle;let deliver,created=false;
 f.outerElement.evaluateHandle=async fn=>{const handle=await make(fn);created=true;return new Promise(resolve=>{deliver=()=>resolve(handle);});};
 const result=observeUi10ShellConsistently(f.frame,assertUi10ShellBounds,{timeoutMs:10});
 await assert.rejects(result,/observation-deadline/);assert.equal(created,true);assert.equal(f.listeners.size,1);deliver();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.listeners.size,0);assert(f.handles.every(handle=>handle.disposed));assert.equal(f.handles.some(handle=>handle.kind==='child'),false);
});
test('runner binds the new helper and keeps acquired title and shell failure evidence',()=>{
 const source=readFileSync(new URL('./ui10-package-matrix-browser.mjs',import.meta.url),'utf8');
 for(const needle of ["'ui10-shell-observation.mjs'",'error.ui10ShellDiagnostics','error.ui10TitleObservation','titleObservationOnFailure'])assert(source.includes(needle),needle);
});
