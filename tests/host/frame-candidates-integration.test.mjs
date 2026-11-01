import test from 'node:test';import assert from 'node:assert/strict';import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
// Real frame-client, lifecycle and candidate shadow renderer; synthetic DOM,
// owner replies and navigation/panel doubles (not browser authorization).
function fixture(capability,role='workspace'){
 if(arguments.length===0)capability=true;
 class E{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};}append(...ns){for(const n of ns){n.parent=this;this.children.push(n);}}setAttribute(k,v){this.attrs[k]=v;}attachShadow(){return this.shadowRoot=new E('shadow');}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}replaceChildren(){this.children=[];}addEventListener(k,f){this.handlers[k]=f;}all(){return [this,...this.children.flatMap(n=>n.all()),...(this.shadowRoot?.all()??[])];}}
 let time=1000,id=0,nav,focused=true,scope='scope',rendered=false,revealResult=true,needLocation=false,viewReply=null,currentEntryReply=null;const published=[],revealed=[],entries=[],order=[],listeners=new Map();const timers=new Map(),messages=new Set(),calls=[],body=new E('body'),root=new E('main');body.append(root);const doc={body,createElement:t=>new E(t),defaultView:{crypto,parent:{postMessage(){}}},hasFocus:()=>focused,addEventListener(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f);},removeEventListener(t,f){listeners.get(t)?.delete(f);}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:scope,role,expiresAt:new Date(time+20000).toISOString()});
 const item=id=>({renderKey:'candidate:'+id,nativeTitle:'同名项目',titleState:'exact',available:true,reason:null});let list=async()=>({ok:true,items:[item('one'),item('two')]}),activate=async()=>({ok:true});
 const runtime={connect:()=>({onMessage:{addListener:f=>messages.add(f),removeListener:f=>messages.delete(f)},onDisconnect:{addListener(){},removeListener(){}},disconnect(){}}),async sendMessage(m){calls.push(m);order.push(m.type);if(m.type==='HOST_UI_CURRENT_ENTRY'&&currentEntryReply)return currentEntryReply(m);if(m.type==='HOST_UI_VIEW'&&viewReply){const custom=await viewReply(m);if(custom!==undefined)return custom;}if(m.type==='HOST_UI_VIEW')return {ok:true,state:'ready',...(capability===undefined?{}:{nativeCandidates:capability}),page:{protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}}},navigation:[]};if(m.type==='HOST_UI_CANDIDATES')return list(m);if(m.type==='HOST_UI_ACTIVATE_CANDIDATE')return activate(m);return {ok:true,grant:grant()};}};
 const attachedCandidates=[],panels=[];const panel=o=>{panels.push(o);return {open(){},stop(){},invalidate(){}};};
 const client=createFreeFrameClient({document:doc,privateRoot:root,runtime,role,parentOrigin:'https://chatgpt.com',now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),backupFactory:panel,recoveryFactory:panel,snippetsFactory:panel,navigationFactory:o=>{nav=o;return {attachNativeCandidates:n=>{attachedCandidates.push(n);return true;},workspaceEntered(){entries.push('workspace');order.push('navigation.workspaceEntered');return true;},restoreFrameView(){},updateFrameProjection(page){published.push(page);rendered=true;},needsNativeProject(projectId){return needLocation&&!published.at(-1)?.groups?.items.some(g=>g.id===(typeof projectId==='string'?projectId:projectId.projectId));},revealNativeProject(value){const actual=needLocation?published.at(-1)?.groups?.items.some(g=>g.id===value.projectId):rendered;revealed.push({...value,rendered:actual});return actual&&revealResult;},present(){},invalidate(){},stop(){}};}});
 return {client,calls,root,item,published,attachedCandidates,resumePanel:()=>{const p=panels.at(-1);(p.onResume??p.onClose)();},setNeedLocation:v=>needLocation=v,viewReply:fn=>viewReply=fn,currentEntryReply:fn=>currentEntryReply=fn,revealed,entries,order,setReveal:v=>revealResult=v,workspaceEntry:()=>{for(const f of messages)f({type:'VAIWL_UI_WORKSPACE_ENTERED'});},focus:v=>focused=v,interrupt:(trusted=true,type='pointerdown')=>{for(const f of listeners.get(type)??[])f({isTrusted:trusted});},renewScope:async()=>{scope='scope-new';time+=10000;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();},list:fn=>{list=fn;},activate:fn=>{activate=fn;},get nav(){return nav;},advance:async ms=>{time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();},jump:ms=>{time+=ms;},emit:()=>{for(const f of messages)f({type:'VAIWL_UI_DATA_CHANGED'});},buttons:()=>root.all().filter(n=>n.tag==='button'),async start(entered=true){await client.start();await drain();if(entered){for(const f of messages)f({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();}}};
}
test('capability enables bounded LIST and distinct same-name buttons; only trusted activation uses current grant',async()=>{const f=fixture();await f.start();assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_CANDIDATES'),{v:1,type:'HOST_UI_CANDIDATES',grantId:'grant',mountId:'mount',offset:0});const buttons=f.buttons();assert.equal(buttons.length,2);assert.equal(buttons[0].textContent,buttons[1].textContent);assert.notEqual(buttons[0].attrs['data-candidate-key'],buttons[1].attrs['data-candidate-key']);await buttons[0].handlers.click({isTrusted:false});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE').length,0);await buttons[1].handlers.click({isTrusted:true});const m=f.calls.find(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE');assert.deepEqual(Object.keys(m).sort(),['actionId','grantId','mountId','presentation','renderKey','type','v']);assert.equal(m.grantId,'grant');assert.equal(m.mountId,'mount');assert.equal(m.renderKey,'candidate:two');assert.deepEqual(m.presentation,{offset:0,scrollTop:0,focused:false});assert.match(m.actionId,/^[0-9a-f-]{36}$/);f.client.stop();});
test('old or explicitly disabled host capability never sends candidate LIST',async()=>{for(const flag of [undefined,false]){const f=fixture(flag);await f.start();assert.equal(f.calls.some(m=>m.type==='HOST_UI_CANDIDATES'),false);assert.equal(f.buttons().length,0);f.client.stop();}});
for(const mode of ['backup','recovery','stop','expired'])test(mode+' prevents retained candidate from activating',async()=>{const f=fixture();await f.start();const button=f.buttons()[0];if(mode==='backup')f.nav.onBackupRequest();if(mode==='recovery')f.nav.onRecoveryRequest();if(mode==='stop')f.client.stop();if(mode==='expired')f.jump(20001);await button.handlers.click({isTrusted:true});assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);if(mode!=='expired')assert.equal(f.buttons().length,0);f.client.stop();});
for(const mode of ['backup','recovery','stop','expired'])test('late LIST after '+mode+' cannot republish candidates',async()=>{const f=fixture(),held=deferred();f.list(()=>held.promise);await f.start();assert(f.calls.some(m=>m.type==='HOST_UI_CANDIDATES'));if(mode==='backup')f.nav.onBackupRequest();if(mode==='recovery')f.nav.onRecoveryRequest();if(mode==='stop')f.client.stop();if(mode==='expired')f.jump(20001);held.resolve({ok:true,items:[f.item('late')]});await drain();assert.equal(f.buttons().length,0);f.client.stop();});
test('pending activation and an unconfirmed result never cause automatic replay',async()=>{const f=fixture(),held=deferred();f.activate(()=>held.promise);await f.start();const b=f.buttons()[0],pending=b.handlers.click({isTrusted:true});await b.handlers.click({isTrusted:true});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE').length,1);held.resolve({ok:false});await pending;await b.handlers.click({isTrusted:true});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE').length,1);f.client.stop();});

test('candidate next page persists on view refresh without changing native view query',async()=>{
 const f=fixture();f.list(async m=>{const offset=m.offset??0,total=65;return {ok:true,items:Array.from({length:Math.min(32,total-offset)},(_,i)=>f.item('row'+(offset+i))),page:{offset,total,nextOffset:offset+32<total?offset+32:null}};});await f.start();
 const next=()=>f.buttons().find(n=>n.textContent==='下一页');assert(next());await next().handlers.click({isTrusted:true});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').at(-1).offset,32);
 const before=f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query;f.emit();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').at(-1).offset,32);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,before);
 await next().handlers.click({isTrusted:true});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').at(-1).offset,64);assert(f.buttons().some(n=>n.attrs['data-candidate-key']==='candidate:row64'));assert(next().disabled);f.client.stop();
});

test('losing candidate capability removes the auxiliary disclosure without clearing the workspace',async()=>{
 const f=fixture();await f.start();const disclosure=f.root.all().find(n=>n.tag==='details');assert.ok(disclosure);assert.notEqual(disclosure.hidden,true);
 f.viewReply(async()=>({ok:true,state:'ready',nativeCandidates:false,page:f.published.at(-1),navigation:[]}));f.emit();await drain();
 assert.equal(disclosure.hidden,true);assert.equal(f.buttons().length,0);assert.ok(f.published.length>1);f.client.stop();
});
for(const panel of ['Backup','Recovery','Snippets'])test('candidate component reconnects after '+panel+' returns to the formal view',async()=>{
 const f=fixture();await f.start();const original=f.attachedCandidates.at(-1),count=f.attachedCandidates.length;assert.ok(original);
 f.nav['on'+panel+'Request']();f.resumePanel();await drain();
 assert.ok(f.attachedCandidates.length>count);assert.equal(f.attachedCandidates.at(-1),original);assert.equal(original.hidden,false);assert.equal(f.buttons().length,2);f.client.stop();
});
const migration=(extra={})=>({id:'migration-one',projectId:'project-one',presentation:{offset:0,scrollTop:13,focused:true},ready:false,focusAllowed:false,...extra});
test('LIST unready migration never reveals; ready empty candidate list reveals rendered project once',async()=>{const f=fixture();let ready=false;f.list(async()=>({ok:true,items:[],migration:migration({ready,focusAllowed:ready})}));await f.start();assert.equal(f.revealed.length,0);ready=true;f.emit();await drain();assert.deepEqual(f.revealed,[{projectId:'project-one',focus:true,rendered:true}]);assert.equal(f.buttons().length,0);f.emit();await drain();assert.equal(f.revealed.length,1);f.client.stop();});
test('background document never receives migration focus',async()=>{const f=fixture();f.focus(false);f.list(async()=>({ok:true,items:[],migration:migration({ready:true,focusAllowed:true})}));await f.start();assert.deepEqual(f.revealed,[{projectId:'project-one',focus:false,rendered:true}]);f.client.stop();});
for(const type of ['pointerdown','keydown','wheel'])for(const trusted of [false,true])test('migration interrupt '+type+' trusted='+trusted,async()=>{const f=fixture();let ready=false;f.list(async()=>({ok:true,items:[],migration:migration({ready,focusAllowed:ready})}));await f.start();f.interrupt(trusted,type);ready=true;f.emit();await drain();assert.equal(f.revealed.length,trusted?0:1);if(!trusted)assert.equal(f.revealed[0].focus,true);else assert.equal(f.root.all().some(n=>n.scrollTop===13),false,'no delayed candidate scroll restoration');f.emit();await drain();assert.equal(f.revealed.length,trusted?0:1);f.client.stop();});
for(const mode of ['stop','scope'])test('late migration reply after '+mode+' cannot locate or focus',async()=>{const f=fixture(),held=deferred();f.list(()=>held.promise);await f.start();if(mode==='stop')f.client.stop();else await f.renewScope();held.resolve({ok:true,items:[],migration:migration({ready:true,focusAllowed:true})});await drain();assert.equal(f.revealed.length,0);f.client.stop();});

test('candidate restoration is consumed once and ordinary refresh preserves later user scroll',async()=>{
 const f=fixture();f.list(async()=>({ok:true,items:[f.item('one')],migration:migration({ready:true,focusAllowed:true})}));await f.start();let ul=f.root.all().find(n=>n.tag==='ul');assert.equal(ul.scrollTop,13);ul.scrollTop=27;f.emit();await drain();ul=f.root.all().find(n=>n.tag==='ul');assert.equal(ul.scrollTop,27);assert.equal(f.revealed.length,1);f.client.stop();
});
test('valid LIST without migration revokes pending reveal and later target cannot revive it',async()=>{
 const f=fixture();let included=true;f.setReveal(false);f.list(async()=>({ok:true,items:[f.item('one')],...(included?{migration:migration({ready:true,focusAllowed:true})}:{})}));await f.start();assert.equal(f.revealed.length,2,'entry attempt and ready LIST retry both remain pending');included=false;f.emit();await drain();const count=f.revealed.length;f.setReveal(true);f.emit();await drain();assert.equal(f.revealed.length,count);included=true;f.emit();await drain();assert.equal(f.revealed.length,count);f.client.stop();
});
for(const role of ['workspace','sidebar'])test('workspace entry refreshes candidate readiness even when current entry unavailable for '+role,async()=>{
 const f=fixture(true,role);let ready=false;f.list(async()=>({ok:true,items:[],migration:migration({ready,focusAllowed:ready})}));await f.start();const before=f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length;ready=true;f.workspaceEntry();await drain();assert.ok(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length>before);assert.equal(f.revealed.at(-1).projectId,'project-one');assert.equal(f.calls.some(m=>m.type==='HOST_UI_CURRENT_ENTRY'),false);f.client.stop();
});

for(const role of ['workspace','sidebar'])test('entry synchronously updates renderer mode before candidate refresh without changing query '+role,async()=>{
 const f=fixture(true,role);await f.start(false);const query=structuredClone(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query),before=f.order.length;assert.deepEqual(f.entries,[]);f.workspaceEntry();assert.deepEqual(f.entries,['workspace']);assert.equal(f.order[before],'navigation.workspaceEntered');await drain();assert.ok(f.order.slice(before+1).includes('HOST_UI_CANDIDATES'));assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);assert.deepEqual(f.revealed,[]);f.client.stop();
});
test('same-page empty candidate list consumes failed position restore before later rows appear',async()=>{
 const f=fixture();let empty=true;f.list(async()=>({ok:true,items:empty?[]:[f.item('one')],migration:migration({ready:true,focusAllowed:false})}));await f.start();assert.equal(f.revealed.length,1);empty=false;f.emit();await drain();const ul=f.root.all().find(n=>n.tag==='ul');assert.equal(ul.scrollTop,0);assert.equal(f.revealed.length,1);f.client.stop();
});

test('ready migration DTO cannot reveal before trusted lifecycle workspace entry',async()=>{
 const f=fixture();f.list(async()=>({ok:true,items:[],migration:migration({ready:true,focusAllowed:true})}));await f.start(false);assert.deepEqual(f.revealed,[]);assert.deepEqual(f.entries,[]);f.workspaceEntry();assert.deepEqual(f.entries,['workspace']);await drain();assert.equal(f.revealed.length,1);f.client.stop();
});

for(const mode of ['missing','different'])test('cross-page queued restore is discarded when arriving LIST migration is '+mode,async()=>{
 const f=fixture(),held=deferred();let moved=false,offered=false;const items=Array.from({length:32},(_,i)=>f.item('row'+i));
 f.list(async m=>{if(m.offset===32){moved=true;return held.promise;}return {ok:true,items,page:{offset:0,total:33,nextOffset:32},...(offered?{migration:migration({ready:true,focusAllowed:false,presentation:{offset:32,scrollTop:137,focused:false}})}:{})};});
 await f.start();offered=true;f.emit();await drain();assert.equal(moved,true);held.resolve({ok:true,items:[f.item('tail')],page:{offset:32,total:33,nextOffset:null},...(mode==='different'?{migration:migration({id:'other-migration',ready:false,presentation:{offset:32,scrollTop:71,focused:false}})}:{})});await drain();const ul=f.root.all().find(n=>n.tag==='ul');assert.equal(ul.scrollTop,0,'old migration scroll must never apply to fresh response');assert.ok(f.buttons().some(n=>n.attrs['data-candidate-key']==='candidate:tail'));f.client.stop();
});

const locationSession={H:30,T:20740,Z:'UTC',policyRevision:0};
function locationReply(message,{found=true,id='project-one',offset=24}={}){const locating=Object.hasOwn(message,'locateProjectId');return {ok:true,state:'ready',nativeCandidates:true,...(locating?{location:{projectId:message.locateProjectId,found}}:{}),page:{protocol:'vaiwl-free-frame/1',role:'workspace',scope:'scopeA',completeSnapshot:false,segment:message.query.segment??0,viewSession:locationSession,workspaceRevision:0,groups:{items:(locating&&found||!locating&&message.query.offset===24)?[{id,nativeName:'Same',name:'Same'},...Array.from({length:7},(_,i)=>({id:'neighbor'+i,name:'Same'}))]:Array.from({length:8},(_,i)=>({id:'initial'+i,name:'Same'})),offset:locating?offset:message.query.offset??0,limit:message.query.limit??8,total:32,hasMore:!locating&&message.query.offset!==24},entries:{noProject:{items:[]},unknown:{items:[]}}},navigation:[]};}
function locatingFixture(){const f=fixture();f.setNeedLocation(true);f.list(async()=>({ok:true,items:[],migration:migration({ready:true,focusAllowed:true})}));return f;}
test('missing exact Project triggers one atomic locate VIEW and focuses only after matching page publication',async()=>{
 const f=locatingFixture();f.viewReply(async m=>locationReply(m));await f.start();const requests=f.calls.filter(m=>m.type==='HOST_UI_VIEW'&&m.locateProjectId);assert.equal(requests.length,1);assert.equal(requests[0].locateProjectId,'project-one');assert.equal(requests[0].query.locateProjectId,undefined);assert.equal(f.published.at(-1).groups.offset,24);assert.ok(f.revealed.some(r=>r.rendered&&r.focus));assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW'&&!m.locateProjectId&&m.query.offset===24).length,1,'accepted location is confirmed once for resume');const publishedQuery=f.calls.find(m=>m.type==='HOST_UI_VIEW').query;assert.deepEqual(requests[0].query,publishedQuery);f.workspaceEntry();await drain();assert.equal(f.calls.filter(m=>m.locateProjectId).length,1);f.client.stop();
});
for(const mode of ['not-found','wrong-id','wrong-scope','wrong-segment','wrong-session','failure'])test('atomic locate '+mode+' preserves existing page without focus',async()=>{
 const f=locatingFixture();f.viewReply(async m=>{const r=locationReply(m);if(!m.locateProjectId)return r;if(mode==='not-found')return locationReply(m,{found:false});if(mode==='wrong-id')r.page.groups.items[0]={id:'same-name-neighbor',name:'Same'};if(mode==='wrong-scope')r.page.scope='scopeB';if(mode==='wrong-segment')r.page.segment=1;if(mode==='wrong-session')r.page.viewSession={...locationSession,H:7};if(mode==='failure')return {ok:false};return r;});await f.start();assert.equal(f.calls.filter(m=>m.locateProjectId).length,1);assert.equal(f.published.at(-1).groups.offset,0);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.client.stop();
});
for(const mode of ['input','expired','no-migration','scope','backup','query','stop'])test('late atomic locate after '+mode+' cannot publish target or focus',async()=>{
 const f=locatingFixture(),held=deferred();let request;f.viewReply(async m=>{if(m.locateProjectId){request=m;return held.promise;}return locationReply(m);});await f.start();assert.ok(request);
 if(mode==='input')f.interrupt(true);if(mode==='expired')f.jump(6000);if(mode==='no-migration'){f.list(async()=>({ok:true,items:[]}));f.emit();await drain();}if(mode==='scope')await f.renewScope();if(mode==='backup')f.nav.onBackupRequest();if(mode==='query'){void f.nav.onProjectionRequest({segment:1,offset:0,limit:8});await drain();}if(mode==='stop')f.client.stop();
 const confirmations=f.calls.filter(m=>m.type==='HOST_UI_VIEW'&&!m.locateProjectId&&m.query.offset===24).length;held.resolve(locationReply(request));await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW'&&!m.locateProjectId&&m.query.offset===24).length,confirmations,'stale location cannot save a resume offset');assert.equal(f.published.some(p=>p.groups.items.some(g=>g.id==='project-one')),false);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.client.stop();
});

for(const mode of ['offset','limit','total','count'])test('malformed or preparing location '+mode+' never publishes or retries',async()=>{
 const f=locatingFixture();f.viewReply(async m=>{const r=locationReply(m);if(!m.locateProjectId)return r;if(mode==='preparing')return {ok:true,state:'preparing'};if(mode==='offset')r.page.groups.offset=-1;if(mode==='limit')r.page.groups.limit=24;if(mode==='total')r.page.groups.total=1;if(mode==='count')r.page.groups.items.pop();return r;});await f.start();assert.equal(f.published.at(-1).groups.offset,0);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.workspaceEntry();await drain();assert.equal(f.calls.filter(m=>m.locateProjectId).length,1);assert.equal(f.calls.some(m=>m.type==='HOST_UI_VIEW'&&!m.locateProjectId&&m.query.offset===24),false);f.client.stop();
});
test('new migration ID during pending location cannot publish the old response',async()=>{
 const f=locatingFixture(),held=deferred();let oldRequest;f.viewReply(async m=>{if(m.locateProjectId){if(!oldRequest){oldRequest=m;return held.promise;}return {ok:false};}return locationReply(m);});await f.start();f.list(async()=>({ok:true,items:[],migration:migration({id:'migration-two',projectId:'project-two',ready:false})}));f.emit();await drain();held.resolve(locationReply(oldRequest));await drain();assert.equal(f.published.some(p=>p.groups.items.some(g=>g.id==='project-one')),false);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.client.stop();
});

test('one logical location tolerates preparing then ready inside its original six-second budget',async()=>{
 const f=locatingFixture();let tries=0;f.viewReply(async m=>m.locateProjectId&&++tries===1?{ok:true,state:'preparing',retryAfterMs:50}:locationReply(m));await f.start();assert.equal(tries,1);assert.equal(f.published.at(-1).groups.offset,0);await f.advance(50);assert.equal(tries,2);assert.equal(f.published.at(-1).groups.offset,24);assert.ok(f.revealed.some(r=>r.rendered&&r.focus));f.workspaceEntry();await drain();assert.equal(tries,2);f.client.stop();
});
test('repeated preparing cannot renew the six-second logical location deadline',async()=>{
 const f=locatingFixture();let tries=0;f.viewReply(async m=>{if(m.locateProjectId){tries++;return {ok:true,state:'preparing',retryAfterMs:50};}return locationReply(m);});await f.start();await f.advance(5900);assert.ok(tries>=2);await f.advance(100);const after=tries;await f.advance(1000);assert.equal(tries,after);assert.equal(f.published.at(-1).groups.offset,0);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.workspaceEntry();await drain();assert.equal(tries,after);f.client.stop();
});

for(const changed of [false,true])test('hint-cancelled location retries within its original budget even with unchanged projection version '+changed,async()=>{
 const f=locatingFixture(),held=deferred();let revision=1,attempts=0;f.viewReply(async m=>{const r=locationReply(m);r.page.revision=revision;if(m.locateProjectId&&++attempts===1)return held.promise;return r;});await f.start();assert.equal(attempts,1);if(changed)revision++;f.emit();await drain();assert.equal(attempts,2);assert.equal(f.published.at(-1).groups.offset,24);held.resolve(locationReply({query:{segment:0,offset:0,limit:8},locateProjectId:'project-one'}));await drain();assert.equal(attempts,2);f.client.stop();
});
for(const changed of [false,true])test('hint cancellations cannot exceed three location attempts '+changed,async()=>{
 const f=locatingFixture(),held=[];let revision=1;f.viewReply(async m=>{const r=locationReply(m);r.page.revision=revision;if(m.locateProjectId){const d=deferred();held.push(d);return d.promise;}return r;});await f.start();assert.equal(held.length,1);for(let i=0;i<5;i++){if(changed)revision++;f.emit();await drain();assert.equal(held.length,Math.min(3,i+2));}assert.equal(f.published.at(-1).groups.offset,0);f.client.stop();for(const h of held)h.resolve({ok:false});await drain();
});
test('current-entry calibration completes before ready missing Project location can start',async()=>{
 const f=locatingFixture(),held=deferred();let calibrated=false;f.currentEntryReply(()=>held.promise);f.viewReply(async m=>{if(m.locateProjectId)assert.equal(calibrated,true,'location may not compete with current-entry');const r=locationReply(m);if(calibrated)r.page.viewSession={...locationSession,T:locationSession.T+1};return r;});await f.start(false);f.workspaceEntry();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CURRENT_ENTRY').length,1);assert.equal(f.calls.some(m=>m.locateProjectId),false);calibrated=true;held.resolve({ok:true,segment:0,workspaceRevision:0,viewSession:{...locationSession,T:locationSession.T+1}});await drain();assert.equal(f.calls.filter(m=>m.locateProjectId).length,1);assert.equal(f.published.at(-1).groups.offset,24);assert.equal(f.published.at(-1).viewSession.T,locationSession.T+1);f.client.stop();
});

for(const failure of ['reply','throw'])test('failed next candidate page '+failure+' removes old controls and explicitly retries the requested offset',async()=>{
 const f=fixture();let fail=true;
 f.list(async m=>{if(m.offset===32&&fail){if(failure==='throw')throw Error('offline');return {ok:false};}const offset=m.offset??0;return {ok:true,items:Array.from({length:offset===0?32:1},(_,i)=>f.item('row'+(offset+i))),page:{offset,total:33,nextOffset:offset===0?32:null}};});
 await f.start();const old=f.buttons().find(b=>b.attrs['data-candidate-key']),next=f.buttons().find(b=>b.textContent==='下一页');assert.ok(next);await next.handlers.click({isTrusted:true});await drain();
 assert.equal(f.buttons().some(b=>b.attrs['data-candidate-key']),false);const retry=f.buttons().find(b=>b.textContent==='重试');assert.ok(retry);
 await old.handlers.click({isTrusted:true});assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);
 const requests=f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length;await retry.handlers.click({isTrusted:false});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length,requests);
 fail=false;await retry.handlers.click({isTrusted:true});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').at(-1).offset,32);assert.ok(f.buttons().some(b=>b.attrs['data-candidate-key']==='candidate:row32'));assert.equal(f.buttons().some(b=>b.textContent==='重试'),false);assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);f.client.stop();
});

for(const failure of ['reply','throw'])test('initial candidate '+failure+' exposes explicit retry without a prior candidate renderer',async()=>{
 const f=fixture();f.list(async()=>{if(failure==='throw')throw Error('offline');return {ok:false};});await f.start(false);
 const retry=f.buttons().find(b=>b.textContent==='重试');assert.ok(retry);assert.equal(f.buttons().some(b=>b.attrs['data-candidate-key']),false);
 f.list(async()=>({ok:true,items:[f.item('recovered')]}));await retry.handlers.click({isTrusted:true});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').at(-1).offset,0);assert.ok(f.buttons().some(b=>b.attrs['data-candidate-key']==='candidate:recovered'));assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);f.client.stop();
});

for(const invalidation of ['scope','backup','stop'])test('candidate retry after '+invalidation+' cannot fetch or activate stale controls',async()=>{
 const f=fixture();f.list(async()=>({ok:false}));await f.start();const retry=f.buttons().find(b=>b.textContent==='重试');assert.ok(retry);
 if(invalidation==='scope'){f.viewReply(async()=>({ok:true,state:'ready',nativeCandidates:false,page:f.published.at(-1),navigation:[]}));await f.renewScope();}else if(invalidation==='backup')f.nav.onBackupRequest();else f.client.stop();
 assert.equal(f.buttons().length,0);const before=f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length;await retry.handlers.click({isTrusted:true});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CANDIDATES').length,before);assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);assert.equal(f.buttons().length,0);f.client.stop();
});

test('late failed candidate reply after scope replacement cannot recreate retry surface',async()=>{
 const f=fixture(),held=deferred();f.list(()=>held.promise);await f.start();f.viewReply(async()=>({ok:true,state:'ready',nativeCandidates:false,page:f.published.at(-1),navigation:[]}));await f.renewScope();held.resolve({ok:false});await drain();assert.equal(f.buttons().length,0);assert.equal(f.calls.some(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE'),false);f.client.stop();
});

for(const interruptedAfter of [false,true])test('fresh trusted candidate action supersedes earlier UI interruption, later input cancels='+interruptedAfter,async()=>{
 const f=fixture();let actionId=null;f.activate(async m=>{actionId=m.actionId;return {ok:true,state:'dispatched'};});await f.start();f.interrupt(true,'wheel');await f.buttons()[0].handlers.click({isTrusted:true});assert(actionId);
 if(interruptedAfter)f.interrupt(true,'pointerdown');f.list(async()=>({ok:true,items:[],migration:migration({id:actionId,ready:true,focusAllowed:true})}));f.emit();await drain();assert.equal(f.revealed.length,interruptedAfter?0:1);if(!interruptedAfter)assert.equal(f.revealed[0].focus,true);f.client.stop();
});
test('LIST started before a new candidate action cannot revoke its later exact migration',async()=>{
 const f=fixture(),held=deferred();let actionId=null;await f.start();f.list(()=>held.promise);f.emit();await drain();f.activate(async m=>{actionId=m.actionId;return {ok:true,state:'dispatched'};});await f.buttons()[0].handlers.click({isTrusted:true});assert(actionId);
 held.resolve({ok:true,items:[],migration:migration({id:'obsolete',ready:true,focusAllowed:true})});await drain();assert.equal(f.revealed.length,0);
 f.list(async()=>({ok:true,items:[],migration:migration({id:actionId,ready:true,focusAllowed:true})}));f.emit();await drain();assert.equal(f.revealed.length,1);f.client.stop();
});

test('migration tombstone capacity never blocks explicit native candidate activation',async()=>{
 const f=fixture();let actionId=null;f.activate(async m=>{actionId=m.actionId;return {ok:true,state:'dispatched'};});await f.start();
 for(let i=0;i<34;i++){await f.buttons()[0].handlers.click({isTrusted:true});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_ACTIVATE_CANDIDATE').length,i+1);f.list(async()=>({ok:true,items:[f.item('one')],migration:migration({id:actionId,ready:true,focusAllowed:true})}));f.emit();await drain();}
 assert.equal(f.revealed.length,32);f.client.stop();
});

for(const changed of [false,true])test('hint-cancelled location keeps its first six-second deadline '+changed,async()=>{
 const f=locatingFixture(),held=[];let revision=1;
 f.viewReply(async m=>{const r=locationReply(m);r.page.revision=revision;if(m.locateProjectId){const d=deferred();held.push(d);return d.promise;}return r;});
 await f.start();assert.equal(held.length,1);f.jump(5900);if(changed)revision++;f.emit();await drain();assert.equal(held.length,2);
 f.jump(101);held[1].resolve(locationReply({query:{segment:0,offset:0,limit:8},locateProjectId:'project-one'}));await drain();
 assert.equal(f.published.at(-1).groups.offset,0);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);
 if(changed)revision++;f.emit();await drain();assert.equal(held.length,2);f.client.stop();held[0].resolve({ok:false});await drain();
});

for(const returnToOld of [false,true])test('new query revokes hint-cancelled migration retry even after returning '+returnToOld,async()=>{
 const f=locatingFixture(),locate=deferred(),hint=deferred();let holding=false,attempts=0,oldRequest;
 f.viewReply(async m=>{if(m.locateProjectId){attempts++;oldRequest=m;return locate.promise;}if(holding)return hint.promise;return locationReply(m);});
 await f.start();assert.equal(attempts,1);holding=true;f.emit();await drain();holding=false;
 await f.nav.onProjectionRequest({segment:1,offset:0,limit:8});await drain();
 if(returnToOld){await f.nav.onProjectionRequest({segment:0,offset:0,limit:8});await drain();}
 assert.equal(attempts,1,'new user query must consume the old retry permission');
 f.emit();await drain();assert.equal(attempts,1);
 locate.resolve(locationReply(oldRequest));hint.resolve(locationReply({query:{segment:0,offset:0,limit:8}}));await drain();
 assert.equal(f.published.at(-1).segment,returnToOld?0:1);assert.equal(f.published.at(-1).groups.offset,0);assert.equal(f.revealed.some(r=>r.rendered&&r.focus),false);f.client.stop();
});

test('candidate promotion shrinking 33 to 32 converges to the owner validated last page',async()=>{const f=fixture();let ready=false;f.list(async m=>{const total=ready?32:33,offset=Math.min(m.offset??0,Math.floor((total-1)/32)*32);return {ok:true,items:Array.from({length:Math.min(32,total-offset)},(_,i)=>f.item('row'+(offset+i))),page:{offset,total,nextOffset:offset+32<total?offset+32:null},migration:migration({ready,focusAllowed:ready,presentation:{offset:32,scrollTop:13,focused:true}})};});await f.start();await f.buttons().find(n=>n.textContent==='下一页').handlers.click({isTrusted:true});await drain();assert.equal(f.revealed.length,0);ready=true;const before=f.calls.length;f.emit();await drain();assert.equal(f.revealed.length,1);assert(f.calls.slice(before).filter(m=>m.type==='HOST_UI_CANDIDATES').length<4);f.emit();await drain();assert.equal(f.revealed.length,1);f.client.stop();});


for(const role of ['workspace','sidebar'])test('frame candidate scroll ownership follows its bound role '+role,async()=>{
 const f=fixture(true,role);await f.start();const styles=f.root.all().filter(n=>n.tag==='style').map(n=>n.textContent).join('');
 assert.equal(styles.includes('ul{max-height:none;overflow:visible}'),role==='sidebar');
 f.client.stop();assert.equal(f.buttons().length,0);
});
