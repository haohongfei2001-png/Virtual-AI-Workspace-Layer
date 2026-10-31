import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {enterPartialNativeHistory} from './partial-native-surface.mjs';
test('PARTIAL reveals native history through genuine reading and explicit list release before wheel',async()=>{
 const calls=[];const page={getByRole:(role,options)=>({isVisible:async()=>true,click:async()=>calls.push([options.name==='显示原生列表'?'list':'reading',role,options.name])}),locator:selector=>({click:async()=>calls.push(['click',selector]),waitFor:async options=>calls.push(['visible',selector,options.state])}),waitForFunction:async fn=>{calls.push(['closed',fn.toString()]);}};
 assert.deepEqual(await enterPartialNativeHistory(page),{kind:'GENUINE_NATIVE_READING_AND_LIST_RELEASE',openOwnedSurfaces:0,nativeHistoryVisible:true});assert.deepEqual(calls.map(c=>c[0]),['reading','click','list','closed','visible']);assert.equal(calls[1][1],'#prompt-textarea');assert(calls[3][1].includes('length===0'));
 const runner=await readFile(new URL('./partial-package-mv3-browser.mjs',import.meta.url),'utf8');assert(runner.indexOf('await enterPartialNativeHistory(page)')<runner.indexOf('await nav.hover()'));assert(runner.includes('partialOriginalFileInput.files[0]===partialOriginalFile'));assert(runner.includes('document===partialOriginalDocument'));
 const source=await readFile(new URL('./partial-native-surface.mjs',import.meta.url),'utf8');assert(!/force:|removeAttribute|hidePopover|\.fill\(/.test(source));
});
for(const stage of ['click','closed','visible'])test('PARTIAL native entry cannot report success after '+stage+' failure',async()=>{
 const fail=()=>{throw Error(stage);};const page={getByRole:()=>({isVisible:async()=>true,click:async()=>{}}),locator:()=>({click:async()=>{if(stage==='click')fail();},waitFor:async()=>{if(stage==='visible')fail();}}),waitForFunction:async()=>{if(stage==='closed')fail();}};await assert.rejects(()=>enterPartialNativeHistory(page),new RegExp(stage));
});

test('native window shrink at bottom really fetches page 75; draining top scroll before shrink avoids it',async()=>{
 const {runInNewContext}=await import('node:vm');const source=(await readFile(new URL('./fixtures/variants-native.mjs',import.meta.url),'utf8')).split('let lastConversation=')[0].replace("import '/native.mjs';",'');
 async function scenario(reset){
  let listener;const requests=[];const nav={scrollTop:0,clientHeight:200,scrollHeight:1200,querySelectorAll:()=>Array.from({length:25},()=>({remove(){}})),addEventListener:(_name,fn)=>listener=fn,append(){}};
  await runInNewContext('(async()=>{'+source+'})()',{document:{querySelector:()=>nav,createElement:()=>({})},fetch:async url=>{if(url==='/native/preferences')return {json:async()=>({account_id:'account-host-personal'})};const offset=Number(new URL(url,'http://fixture').searchParams.get('offset'));requests.push(offset);return {ok:true,json:async()=>({items:[{id:'observed-native-item',title:'Native'}],windowed:true,next_offset:offset+25})};}});
  nav.scrollTop=1000;await listener();await listener();assert.deepEqual(requests,[25,50]);
  if(reset){nav.scrollTop=0;await listener();}
  const wasScrolled=nav.scrollTop>0;nav.scrollHeight=200;nav.scrollTop=0;if(wasScrolled)await listener();
  return requests;
 }
 assert.deepEqual(await scenario(false),[25,50,75]);assert.deepEqual(await scenario(true),[25,50]);
 const runner=await readFile(new URL('./partial-package-mv3-browser.mjs',import.meta.url),'utf8');assert(runner.indexOf('await preparePartialHistoryUnmount(page)')<runner.indexOf("nav.querySelectorAll('a').forEach(a=>a.remove())"));
});

test('native search requires new current identity then real return, never waits for hidden frame visibility',async()=>{
 const {returnPartialSearchWorkspace}=await import('./partial-native-surface.mjs'),calls=[],old={url:()=> 'extension/workspace'},fresh={url:()=> 'extension/workspace',locator:selector=>({waitFor:async options=>calls.push(['current',selector,options])})};
 const page={frames:()=>[old,fresh],getByRole:(role,options)=>({click:async timing=>calls.push(['return',role,options,timing])})};
 assert.deepEqual(await returnPartialSearchWorkspace(page,{workspaceURL:'extension/workspace',conversationId:'999',oldFrames:[old]}),{newCurrentAdmitted:true,nativeReturnClicked:true});assert.equal(calls[0][2].state,'attached');assert(calls[0][2].timeout>0&&calls[0][2].timeout<=15000);assert.equal(calls[1][2].name,'返回工作空间');assert(calls[1][3].timeout>0&&calls[1][3].timeout<=calls[0][2].timeout);
 fresh.locator=()=>({waitFor:async()=>{throw Error('new-current-not-admitted');}});calls.length=0;await assert.rejects(()=>returnPartialSearchWorkspace(page,{workspaceURL:'extension/workspace',conversationId:'999',oldFrames:[old]}),/not-admitted/);assert.equal(calls.length,0,'no return before current admission');
});
