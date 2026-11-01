import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withNativeCurrentRefresh} from './fixtures/native-current-refresh.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
const C='33333333-3333-4333-8333-333333333333',source=await readFile(new URL('./fixtures/variants-native.mjs',import.meta.url),'utf8');
async function nativeHarness(){
 const articles=[],requests=[],buttons=[];let respond=null;
 const reading={append(fragment){for(const node of fragment.nodes){articles.push(node);node.remove=()=>articles.splice(articles.indexOf(node),1);}},querySelectorAll:()=>[...articles]};
 const composer={value:'unsent native draft'},header={append:button=>buttons.push(button)};
 const history={querySelectorAll:()=>[],addEventListener(){}};
 const makeNode=tag=>({tag,dataset:{},nodes:[],listeners:{},append(...nodes){this.nodes.push(...nodes);},addEventListener(name,fn){this.listeners[name]=fn;}});
 const document={querySelector:selector=>selector.startsWith('aside')?history:selector==='#reading'?reading:selector==='#composer'?composer:selector==='main > header'?header:{},createElement:makeNode,createDocumentFragment:()=>makeNode('fragment')};
 const payload={mapping:{message:{message:{id:'same-message',author:{role:'user',id:'user'},create_time:1700000000}}}};
 const fetch=async(url,options)=>{requests.push({url,options});if(url==='/native/preferences')return {json:async()=>({account_id:'team'})};return respond?respond():{ok:true,json:async()=>payload};};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('document','fetch','MutationObserver','location',withNativeCurrentRefresh(source).replace("import '/native.mjs';",''))(document,fetch,class{observe(){}},{pathname:'/c/'+C});
 return {articles,requests,composer,button:buttons[0],payload,response(fn){respond=fn;},click:()=>buttons[0].listeners.click()};
}
test('explicit refresh transforms require exact native anchors and introduce no timer or authority channel',()=>{
 for(const bad of ['',source+source,source.replace('reading.append(fragment);','')])assert.throws(()=>withNativeCurrentRefresh(bad),/native-refresh-source-mismatch/);
 const transformed=withNativeCurrentRefresh(source);assert(transformed.includes("document.querySelector('main > header').append(refreshButton)"));assert(!transformed.includes(".before(refreshButton)"));for(const forbidden of ['setInterval(','setTimeout(','chrome.runtime','indexedDB','HOST_'])assert(!transformed.includes(forbidden));
});
test('one explicit native click produces one account-bound detail GET and replaces repeated snapshot',async()=>{
 const f=await nativeHarness();assert.equal(f.articles.length,1);const before=f.requests.length,originalComposer=f.composer;
 await f.click();assert.equal(f.requests.length,before+1);assert.equal(f.requests.at(-1).url,'/backend-api/conversation/'+C);assert.equal(f.requests.at(-1).options.headers['Chatgpt-Account-Id'],'team');
 assert.equal(f.articles.length,1);assert.equal(f.articles[0].dataset.messageId,'same-message');assert.equal(f.composer,originalComposer);assert.equal(f.composer.value,'unsent native draft');assert.equal(f.button.disabled,false);
 await f.click();assert.equal(f.articles.length,1);assert.equal(f.requests.length,before+2);
});
test('double click while request is pending is single flight and becomes usable after completion',async()=>{
 const f=await nativeHarness();let release;f.response(()=>new Promise(resolve=>{release=resolve;}));const before=f.requests.length;
 const pending=f.click();assert.equal(f.button.disabled,true);await f.click();assert.equal(f.requests.length,before+1);
 release({ok:true,json:async()=>f.payload});await pending;assert.equal(f.button.disabled,false);assert.equal(f.button.dataset.completed,'1');
 f.response(null);await f.click();assert.equal(f.requests.length,before+2);assert.equal(f.articles.length,1);
});
test('rejected native request restores control without deleting the last rendered body',async()=>{
 const f=await nativeHarness(),before=f.articles[0];f.response(()=>Promise.reject(Error('native-network-error')));
 await assert.rejects(f.click(),/native-network-error/);assert.equal(f.button.disabled,false);assert.equal(f.articles[0],before);assert.equal(f.button.dataset.completed,undefined);
 f.response(null);await f.click();assert.equal(f.articles.length,1);
});
test('non-success response never replaces native body or proves accepted refresh',async()=>{
 const f=await nativeHarness(),before=f.articles[0];f.response(()=>({ok:false}));await f.click();assert.equal(f.button.disabled,false);assert.equal(f.articles[0],before);
 // completed is a UI-action completion counter only; no receipt/ACK assertion.
});
test('server option is explicit MODERN only and cannot attach to a journey or fault profile',async()=>{
 for(const options of [{profile:'MODERN',nativeCurrentRefresh:'true'},{profile:'PARTIAL',nativeCurrentRefresh:true},{profile:'FAULT',nativeCurrentRefresh:true},{profile:'MODERN',journey:'J2',nativeCurrentRefresh:true},{profile:'MODERN',journey:'J3',nativeCurrentRefresh:true}])await assert.rejects(createVariantHostFixtureServer(options),/invalid-native-current-refresh/);
});
test('default served fixture remains unchanged while opted-in fixture fingerprints native refresh helper',async t=>{
 const plain=await createVariantHostFixtureServer({profile:'MODERN'}),enabled=await createVariantHostFixtureServer({profile:'MODERN',nativeCurrentRefresh:true});t.after(()=>plain.close());t.after(()=>enabled.close());
 const original=await(await fetch(plain.origin+'/variants-native.mjs')).text(),changed=await(await fetch(enabled.origin+'/variants-native.mjs')).text();assert.equal(original,source);assert(!original.includes('native-current-refresh'));assert(changed.includes('native-current-refresh'));assert.equal(enabled.manifest.nativeCurrentRefresh,true);assert.equal(plain.manifest.nativeCurrentRefresh,false);assert.notEqual(plain.manifest.fixtureHash,enabled.manifest.fixtureHash);
});
