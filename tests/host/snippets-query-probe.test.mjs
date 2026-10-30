import test from 'node:test';
import assert from 'node:assert/strict';
import {installSnippetsQueryProbe,recordSnippetsProbeConsole} from './snippets-query-probe.mjs';

function fixture(role='workspace'){
 const logs=[],listeners=new Map(),globals={},calls=[];let current=null,active=null,time=0,response={ok:true};
 const root={get activeElement(){return active;},querySelector:()=>current};
 const document={hasFocus:()=>true,querySelector:selector=>{assert.equal(selector,'[data-vaiwl-frame-role="workspace"]');return {shadowRoot:root};},addEventListener(type,listener,options){assert.deepEqual(options,{capture:true,passive:true});listeners.set(type,listener);},removeEventListener(type,listener,capture){assert.equal(capture,true);assert.equal(listeners.get(type),listener);listeners.delete(type);}};
 const runtime={async sendMessage(message){assert.equal(this,runtime);calls.push(message);return response;}};const originalSend=runtime.sendMessage;
 const forbidden=()=>{throw Error('diagnostic must not schedule or mutate');};
 const run=new Function('document','chrome','performance','console','globalThis','setTimeout','setInterval','requestAnimationFrame','options',`'use strict';return (${installSnippetsQueryProbe.toString()})(options);`);
 run(document,{runtime},{timeOrigin:1000,now:()=>++time},{log:text=>logs.push(text)},globals,forbidden,forbidden,forbidden,{role});
 function element(tagName,attrs={},value=''){
  let connected=true,stored=value;
  const node=Object.freeze({tagName,getAttribute:key=>attrs[key]??null,hasAttribute:key=>Object.hasOwn(attrs,key),getRootNode:()=>root,get isConnected(){return connected;},get value(){if(tagName!=='INPUT')throw Error('private value must not be read');return stored;},set value(_){forbidden();}});
  return {node,value:next=>{stored=next;},detach:()=>{connected=false;}};
 }
 const fire=(type,node,extra={})=>listeners.get(type)?.(Object.freeze({type,isTrusted:true,inputType:null,composedPath:()=>[node,root],...extra}));
 return {logs,listeners,globals,runtime,originalSend,calls,element,fire,setCurrent:node=>{current=node;active=node;},setResponse:value=>{response=value;},probe:()=>globals.__vaiwlSnippetQueryProbe};
}
const parse=(f,prefix)=>f.logs.filter(text=>text.startsWith(prefix)).map(text=>JSON.parse(text.slice(prefix.length)));
const poison={get(){throw Error('private payload must not be read');}};
test('keyboard trace distinguishes current search target from document-level delivery without changing focus',()=>{
 const f=fixture(),input=f.element('INPUT',{'aria-label':'已知聊天查找输入','data-focus-key':'search-input'},'ab');f.setCurrent(input.node);
 f.fire('keydown',input.node,{key:'n',code:'KeyN'});f.fire('keyup',f.element('BODY').node,{key:'n',code:'KeyN'});
 const rows=parse(f,'SNIPPET_INPUT_TRACE ');assert.equal(rows[0].target.node,rows[0].currentInput.node);assert.equal(rows[1].target,null);assert.equal(rows[1].currentInput.value,'ab');assert(rows.every(r=>r.key==='n'&&r.code==='KeyN'&&r.documentHasFocus&&r.currentInput.focused));f.probe().finish();
});

test('runtime metadata keeps fixed bounded fields and preserves the original reply',async()=>{
 const f=fixture(),long='x'.repeat(250),pageSearch={query:long,projectId:long,offset:0,limit:24};Object.defineProperty(pageSearch,'items',poison);
 const reply={ok:true,state:'ready',page:{search:pageSearch,presentation:{revision:3,intent:{kind:'search-known',themeId:long}}},clearProjection:false};Object.defineProperty(reply,'body',poison);
 const message={type:'HOST_UI_VIEW',query:{segment:0,offset:0,limit:8,search:{query:long,projectId:null,offset:0,limit:24}},grantId:'SECRET_GRANT',token:'SECRET_TOKEN'};Object.defineProperty(message,'body',poison);
 f.setResponse(reply);assert.equal(await f.runtime.sendMessage(message),reply);assert.equal(f.calls[0],message);
 const [row]=parse(f,'SNIPPET_PUBLIC_TRACE ');assert.equal(row.role,'workspace');assert.equal(row.requestQuery.search.query.length,200);assert.equal(row.readySearch.query.length,200);assert.equal(row.pagePresentation.theme.length,200);assert.equal(row.pagePresentation.revision,3);assert.equal(row.clearProjection,false);assert(row.at>row.requestedAt);
 assert(!JSON.stringify(row).includes('SECRET'));assert(!Object.hasOwn(row,'grantId'));assert(!Object.hasOwn(row.readySearch,'items'));
 const snapshot=f.probe().snapshot('after-fill');assert.equal(snapshot.lastViewRequest.query.search.query.length,200);assert.equal(snapshot.lastViewReply.readySearch.query.length,200);
 f.probe().finish();assert.equal(f.runtime.sendMessage,f.originalSend);assert.equal(f.listeners.size,0);assert.equal(f.globals.__vaiwlSnippetQueryProbe,undefined);
});

test('passive events associate the actual input node and distinguish a replacement',()=>{
 const f=fixture(),attrs={'aria-label':'已知聊天查找输入','data-focus-key':'search-input'},first=f.element('INPUT',attrs);
 f.setCurrent(first.node);f.fire('focusin',first.node);f.fire('beforeinput',first.node,{inputType:'insertText'});first.value('typed query');f.fire('input',first.node,{inputType:'insertText'});
 const initial=f.probe().snapshot('after-fill',first.node),second=f.element('INPUT',attrs,'');first.detach();f.setCurrent(second.node);f.fire('focusin',second.node);
 const replaced=f.probe().snapshot('before-locate',first.node),rows=parse(f,'SNIPPET_INPUT_TRACE ');
 assert.equal(rows.length,4);assert.equal(rows[1].target.value,'');assert.equal(rows[2].target.value,'typed query');assert(rows.every(row=>row.isTrusted));assert.equal(rows[2].inputType,'insertText');
 assert.equal(initial.target.node,rows[2].target.node);assert.equal(initial.target.currentInput,true);assert.equal(replaced.target.connected,false);assert.equal(replaced.target.currentInput,false);assert.notEqual(replaced.target.node,replaced.input.node);assert.equal(replaced.input.value,'');
 f.fire('input',f.element('TEXTAREA',{'aria-label':'native composer'}).node);f.fire('click',f.element('BUTTON',{'aria-label':'native title'}).node);assert.equal(parse(f,'SNIPPET_INPUT_TRACE ').length,4);
 const locate=f.element('BUTTON',{'aria-label':'定位片段'}).node;f.fire('click',locate);assert.equal(parse(f,'SNIPPET_INPUT_TRACE ').at(-1).target.value,null);assert.equal(f.probe().snapshot('before-locate',locate).target.node,parse(f,'SNIPPET_INPUT_TRACE ').at(-1).target.node);
});

test('host probe observes only the owned four-grid control and never native inputs',()=>{
 const f=fixture('host');f.fire('input',f.element('TEXTAREA').node);f.fire('click',f.element('BUTTON',{'aria-label':'返回工作空间'}).node);assert.equal(f.logs.length,0);
 const back=f.element('BUTTON',{'aria-label':'返回工作空间','data-va-owned':'owned'}).node;f.fire('click',back);const [row]=parse(f,'SNIPPET_INPUT_TRACE ');assert.equal(row.role,'host');assert.equal(row.target.label,'返回工作空间');assert.equal(row.target.value,null);assert.equal(f.runtime.sendMessage,f.originalSend);
});

test('bounded trace cursor still requires a new successful locate after old entries drop',()=>{
 const report={};for(let i=0;i<300;i++)recordSnippetsProbeConsole(report,'SNIPPET_PUBLIC_TRACE '+JSON.stringify({role:'workspace',type:'HOST_UI_VIEW',ok:true}));
 assert.equal(report.transport.length,256);assert.equal(report.transportSequence,300);assert.equal(report.transportDropped,44);const before=report.transportSequence;
 assert.equal(report.transport.some(row=>row.sequence>before&&row.type==='HOST_UI_SNIPPET'&&row.action==='locate'&&row.ok===true),false);
 recordSnippetsProbeConsole(report,'SNIPPET_PUBLIC_TRACE '+JSON.stringify({role:'workspace',type:'HOST_UI_SNIPPET',action:'locate',ok:false}));assert.equal(report.transport.some(row=>row.sequence>before&&row.type==='HOST_UI_SNIPPET'&&row.action==='locate'&&row.ok===true),false);
 recordSnippetsProbeConsole(report,'SNIPPET_PUBLIC_TRACE '+JSON.stringify({role:'workspace',type:'HOST_UI_SNIPPET',action:'locate',ok:true}));assert.equal(report.transport.length,256);assert.equal(report.transportDropped,46);assert.equal(report.transport.some(row=>row.sequence>before&&row.type==='HOST_UI_SNIPPET'&&row.action==='locate'&&row.ok===true),true);
 for(let i=0;i<257;i++)recordSnippetsProbeConsole(report,'SNIPPET_INPUT_TRACE '+JSON.stringify({role:'workspace',type:'input'}));assert.equal(report.inputEvents.length,256);assert.equal(report.inputEventsDropped,1);
 assert.equal(recordSnippetsProbeConsole(report,'SNIPPET_PUBLIC_TRACE malformed'),false);assert.equal(report.transportSequence,302);
});
