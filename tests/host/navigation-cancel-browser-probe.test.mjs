import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readyDelegatedControl} from './navigation-cancel-browser-probe.mjs';

test('cancellation entry needs a unique current delegated control, not a visible href',()=>{
 const doc={},check=vm.runInNewContext('('+readyDelegatedControl.toString()+')',{document:doc}),node={ownerDocument:doc,isConnected:true,hasAttribute:()=>true,getAttribute:()=>null};
 assert.equal(check([node]),true);
 for(const nodes of [[],[node,node],[{...node,isConnected:false}],[{...node,ownerDocument:{}}],[{...node,hasAttribute:()=>false}],[{...node,getAttribute:()=> 'true'}]])assert.equal(check(nodes),false);
});

function fixture({readyAfter=2,pendingAtClick=false}={}){
 let time=0,samples=0,clicks=0,detached=false,searchValue='',held=false,released=false,fillCalls=0;const trace=[],diagnostics={},contexts=[];
 const cdp={on:(_type,fn)=>contexts.push(fn),async send(type,args){
  if(type==='Runtime.enable'){for(const fn of contexts)fn({context:{id:1,origin:'chrome-extension://fixture',auxData:{frameId:'top',isDefault:false}}});return {};}
  if(type==='Page.getFrameTree')return {frameTree:{frame:{id:'top'}}};
  assert.equal(type,'Runtime.evaluate');const expression=args.expression;let value;
  if(expression.includes('const send=chrome.runtime'))value=undefined;
  else if(expression==='cancelProbe.held')value=held;
  else if(expression==='cancelProbe.replyOK')value=true;
  else if(expression==='cancelProbe.release()'){released=true;trace.push({type:'HOST_UI_DISPATCH_CURRENT',state:'cancelled',actionId:'action',targetKey:'target'});}
  else if(expression.startsWith('({actionId:'))value={actionId:'action',targetKey:'target'};
  else if(expression.includes('const value={count:')){value={count:held?2:0,held,released,replyOK:held};if(held&&!released)released=true;}
  else throw Error('unexpected evaluation');
  return {result:{value}};
 },async detach(){detached=true;}};
 const context={newCDPSession:async()=>cdp,pages:()=>[page]},page={url:()=> 'http://127.0.0.1:1/c/fixture',getByRole:()=>({count:async()=>0}),evaluate:async()=>true};
 const search={async fill(value){fillCalls++;searchValue=value;trace.push({type:'HOST_UI_CANCEL_NAVIGATION',ok:true,state:'cancelled',actionId:'action',targetKey:'target'});},inputValue:async()=>searchValue,isVisible:async()=>true};
 const workspace={getByRole:()=>search},result={async evaluateAll(){samples++;time+=1000;return samples>=readyAfter;},async click({timeout}){assert(timeout<=6000&&timeout>0);clicks++;if(!pendingAtClick)held=true;}};
 const code=readFileSync(new URL('./navigation-cancel-browser-probe.mjs',import.meta.url),'utf8').replace(/^import.*\n/,'').replaceAll('export ','');
 const env=vm.createContext({assert,URL,Date:{now:()=>time},setTimeout:fn=>{time+=10;fn();}});vm.runInContext(code,env);
 return {run:()=>env.probeNavigationCancellation({context,page,workspace,result,extensionId:'fixture',trace,title:'Fixture',diagnostics}),diagnostics,state:()=>({samples,clicks,detached,time,fillCalls,released}),trace};
}

test('pending then ready consumes original window and dispatches only one gesture',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.state,'PASS');assert.equal(f.state().samples,2);assert.equal(f.state().clicks,1);assert(f.state().time<6000);assert.equal(f.diagnostics.phase,'complete');assert(f.state().detached);
});
test('persistent pending exhausts original six seconds without clicking or claiming cancellation',async()=>{
 const f=fixture({readyAfter:Infinity});await assert.rejects(f.run(),/cancel-probe-original-six-second-window/);assert.equal(f.state().samples,6);assert.equal(f.state().clicks,0);assert.equal(f.state().fillCalls,0);assert.equal(f.diagnostics.phase,'control-ready');assert.equal(f.diagnostics.probe.held,false);assert(f.state().detached);
});
test('a later pending race remains a failed hold, never a second click or synthetic cancellation',async()=>{
 const f=fixture({readyAfter:1,pendingAtClick:true});await assert.rejects(f.run(),/cancel-probe-original-six-second-window/);assert.equal(f.state().clicks,1);assert.equal(f.state().fillCalls,0);assert.equal(f.diagnostics.phase,'authorization-hold');assert.equal(f.diagnostics.probe.held,false);assert.equal(f.trace.length,0);assert(f.state().detached);
});
test('readiness arriving after the shared deadline cannot issue even the first click',async()=>{
 const f=fixture({readyAfter:6});await assert.rejects(f.run(),/original six-second window/);assert.equal(f.state().clicks,0);assert.equal(f.state().fillCalls,0);assert.equal(f.diagnostics.phase,'single-click');assert(f.state().detached);
});
