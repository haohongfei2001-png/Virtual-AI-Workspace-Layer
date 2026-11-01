import test from 'node:test';import assert from 'node:assert/strict';
import {createBackgroundAuxiliaryPage} from './background-auxiliary-page.mjs';
function fixture({missing=false,foreign=false,gotoError=false,sessionError=false}={}){
 const calls=[];const page=(id)=>({isClosed:()=>false,goto:async(url,options)=>{calls.push(['goto',id,url,options]);if(gotoError)throw Error('goto-failed');},bringToFront:()=>assert.fail('focus changed'),id});
 const old=page('old'),fresh=page('owned'),imposter=page('wrong'),context={pages:()=>missing?[old]:[old,...foreign?[imposter]:[],fresh],newPage:()=>assert.fail('fallback used'),newCDPSession:async p=>({send:async method=>{calls.push([method,p.id]);if(sessionError)throw Error('session-failed');return {targetInfo:{targetId:p.id}};},detach:async()=>calls.push(['detach',p.id])})};
 const cdp={send:async(method,params)=>{calls.push([method,params]);if(method==='Target.createTarget')return {targetId:'owned'};return {success:true};}};
 return {calls,context,cdp,fresh,old};
}
test('matches exact targetId among existing pages and navigates only owned background target',async()=>{
 const f=fixture({foreign:true}),result=await createBackgroundAuxiliaryPage({...f,url:'chrome-extension://test/controller.html'});assert.equal(result,f.fresh);assert.deepEqual(f.calls[0],['Target.createTarget',{url:'about:blank',background:true}]);assert.deepEqual(f.calls.filter(row=>row[0]==='goto').map(row=>row.slice(0,3)),[['goto','owned','chrome-extension://test/controller.html']]);assert.equal(f.calls.filter(row=>row[0]==='detach').length,3);assert(!f.calls.some(row=>row[0]==='Target.closeTarget'));
});
for(const mode of ['gotoError','sessionError'])test(mode+' closes only created target and preserves existing page',async()=>{
 const f=fixture({[mode]:true});await assert.rejects(createBackgroundAuxiliaryPage({...f,url:'chrome-extension://test/probe.html'}),/failed/);assert.deepEqual(f.calls.filter(row=>row[0]==='Target.closeTarget'),[['Target.closeTarget',{targetId:'owned'}]]);assert(!f.calls.some(row=>row[0]==='goto'&&row[1]==='old'));
});
test('missing exact target times out without false fallback and closes only own target',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const f=fixture({missing:true}),pending=createBackgroundAuxiliaryPage({...f,url:'chrome-extension://test/probe.html'}),rejected=assert.rejects(pending,/timeout/);
 for(let i=0;i<20;i++)await Promise.resolve();t.mock.timers.tick(5000);for(let i=0;i<20;i++)await Promise.resolve();await rejected;assert.deepEqual(f.calls.filter(row=>row[0]==='Target.closeTarget'),[['Target.closeTarget',{targetId:'owned'}]]);assert(!f.calls.some(row=>row[0]==='goto'));
});
test('late target creation after deadline is cleaned without navigating any existing page',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const f=fixture(),send=f.cdp.send;let release;f.cdp.send=(method,params)=>method==='Target.createTarget'?new Promise(resolve=>release=resolve):send(method,params);const pending=createBackgroundAuxiliaryPage({...f,url:'chrome-extension://test/probe.html'}),rejected=assert.rejects(pending,/timeout/);t.mock.timers.tick(5000);await rejected;release({targetId:'late-owned'});for(let i=0;i<10;i++)await Promise.resolve();assert.deepEqual(f.calls.filter(row=>row[0]==='Target.closeTarget'),[['Target.closeTarget',{targetId:'late-owned'}]]);assert(!f.calls.some(row=>row[0]==='goto'));
});

test('navigation shares original five-second deadline and timeout closes owned target',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const f=fixture();f.fresh.goto=async(url,options)=>{assert(options.timeout<=5000);return new Promise(()=>{});};const pending=createBackgroundAuxiliaryPage({...f,url:'chrome-extension://test/probe.html'}),rejected=assert.rejects(pending,/timeout/);
 for(let i=0;i<40;i++)await Promise.resolve();t.mock.timers.tick(5000);for(let i=0;i<20;i++)await Promise.resolve();await rejected;assert.deepEqual(f.calls.filter(row=>row[0]==='Target.closeTarget'),[['Target.closeTarget',{targetId:'owned'}]]);
});
