import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {reduceUI06ParentAX,assertUI06AXPhase,reduceUI06Key,assertUI06Path,assertUI06Continuity,UI06_LIMITS,createUI06Deadline,seedUI06Settings,installUI06ParentProbe} from './ui06-keyboard-ax.mjs';
const backend={reading:11,history:12,historyOther:13,composer:14,workspace:15,sidebar:16};
function tree(open=false){
 const roles={reading:'StaticText',history:'link',historyOther:'link',composer:'textbox',workspace:'Iframe',sidebar:'Iframe'};
 return {frameId:'parent-frame',backend:{...backend},readingMatches:true,nodes:[{nodeId:'root',ignored:false,role:{value:'RootWebArea'},frameId:'parent-frame'},...Object.entries(backend).map(([key,id])=>({nodeId:key,parentId:'root',backendDOMNodeId:id,ignored:key==='composer'?false:['workspace','sidebar'].includes(key)?!open:open,role:{value:roles[key]},name:{value:key==='reading'?'Offline prefix uniquely selected fixture words suffix.':'Ordinary conversation'}}))]};
}
const phase=(raw,open)=>assertUI06AXPhase(reduceUI06ParentAX(raw),open);
test('closed/open/restored raw parent AX trees reduce against six exact native/iframe identities',()=>{for(const open of [false,true,false])phase(tree(open),open);});
test('ignored closed iframe residues are valid but exposed entrance is not',()=>{const input=tree();phase(input,false);input.nodes.find(n=>n.nodeId==='sidebar').ignored=false;assert.throws(()=>phase(input,false),/iframe/);});
for(const key of ['reading','history','historyOther'])test('background-mask mutation exposing '+key+' fails the independent raw AX oracle',()=>{const input=tree(true);input.nodes.find(n=>n.nodeId===key).ignored=false;assert.throws(()=>phase(input,true),);});
for(const key of Object.keys(backend))test('missing positive '+key+' cannot pass its required phase',()=>{const open=['workspace','sidebar'].includes(key),input=tree(open);input.nodes=input.nodes.filter(n=>n.nodeId!==key);assert.throws(()=>phase(input,open));});
test('empty AX is not evidence of successful masking',()=>{const input=tree(true);input.nodes=[];assert.throws(()=>phase(input,true),/empty/);});
test('child-only AX cannot substitute for the parent tree',()=>{const input=tree(true);input.nodes[0].frameId='child-frame';assert.throws(()=>phase(input,true),/parent Root/);});
test('same-title projection link with different backend node cannot stand in for native history',()=>{const input=tree();input.nodes.find(n=>n.nodeId==='history').backendDOMNodeId=777;assert.throws(()=>phase(input,false),);});
test('target disconnected from the actual parent root is not parent AX exposure',()=>{const input=tree();input.nodes.find(n=>n.nodeId==='history').parentId='missing';assert.throws(()=>phase(input,false),);});
test('parent ancestry cycles fail closed',()=>{const input=tree(true);input.nodes.find(n=>n.nodeId==='workspace').parentId='workspace';assert.throws(()=>phase(input,true),/iframe/);});
test('wrong AX roles do not satisfy iframe or native control denominators',()=>{const input=tree(true);input.nodes.find(n=>n.nodeId==='workspace').role.value='button';assert.throws(()=>phase(input,true),/role/);});
test('missing or reused exact DOM backend target rejected before exposure checks',()=>{for(const bad of [undefined,0,backend.reading]){const input=tree();input.backend.history=bad;assert.throws(()=>phase(input,false));}});
test('fixture reading mismatch cannot be waived even while masked',()=>{const input=tree(true);input.readingMatches=false;assert.throws(()=>phase(input,true),/sentinel/);});
function observation({before=2,after=0,direction='Tab',source='workspace',from='owned-control',target='composer',trusted=true}={}){
 const documents=['parent','workspace','sidebar'].map(document=>({document,hasFocus:document==='parent'||document===source,ups:0,up:null,keys:document===source?1:0,key:document===source?{direction,target:from,trusted}:null,focus:document==='parent'?target:'owned-control',open:document==='parent'?after:null,events:document==='parent'&&before>0&&after===0?[{target,open:after}]:[],overflow:false}));
 return {before,after,direction,documents};
}
const key=options=>reduceUI06Key(observation(options));
function path(keys=[key()],options={}){return {direction:'Tab',start:'owned-control',startOpen:2,startTrustedClick:true,elapsedMs:10,keys,...options};}
const assertOpen=value=>assertUI06Path(value,{direction:'Tab',target:'composer',open:true});
test('actual trusted frame Tab can reach original composer and surrender both surfaces',()=>assertOpen(path()));
test('normal protected-native surrender followed by history and composer is allowed',()=>assertOpen(path([key({target:'protected-native'}),key({before:0,after:0,source:'parent',from:'protected-native',target:'history'}),key({before:0,after:0,source:'parent',from:'history'})])));
test('trusted Shift+Tab is a separate observed keyboard direction',()=>{const value=path([key({direction:'Shift+Tab'})],{direction:'Shift+Tab'});assertUI06Path(value,{direction:'Shift+Tab',target:'composer',open:true});});
test('closed trusted reverse history and forward composer paths require actual targets',()=>{for(const [direction,target] of [['Shift+Tab','history'],['Tab','composer']]){const value=path([key({before:0,after:0,direction,source:'parent',from:target==='history'?'composer':'history',target})],{direction,start:target==='history'?'composer':'history',startOpen:0,startTrustedClick:false});assertUI06Path(value,{direction,target,open:false});}});
test('programmatic focus or missing keydown cannot prove keyboard traversal',()=>{const input=observation();input.documents.forEach(d=>{d.keys=0;d.key=null;});assert.throws(()=>reduceUI06Key(input),/keydown/);});
test('untrusted synthetic key event cannot prove keyboard traversal',()=>assert.throws(()=>key({trusted:false}),/untrusted/));
test('missing child instrumentation and duplicate keydown fail closed',()=>{const input=observation();input.documents.pop();assert.throws(()=>reduceUI06Key(input));const duplicate=observation();duplicate.documents[2].keys=1;duplicate.documents[2].key=duplicate.documents[1].key;assert.throws(()=>reduceUI06Key(duplicate),/duplicated/);});
test('wrong direction and stale records rejected',()=>{const input=observation();input.documents[1].key.direction='Shift+Tab';assert.throws(()=>reduceUI06Key(input));const stale=observation();stale.documents[0].key=stale.documents[1].key;assert.throws(()=>reduceUI06Key(stale),/stale/);});
for(const target of ['history','native-background'])test('trusted keys cannot enter masked '+target,()=>assert.throws(()=>key({after:2,target}),/masked/));
test('closed owned iframe exposure is rejected even when key ultimately exits it',()=>{assert.throws(()=>key({before:0,after:0}),/closed frame/);assert.throws(()=>key({before:0,after:0,source:'parent',from:'composer',target:'workspace'}),/closed owned/);});
test('no actual composer target, empty path or absent surrender cannot pass',()=>{assert.throws(()=>assertOpen(path([key({target:'protected-native'})])),/never reached/);assert.throws(()=>assertOpen(path([])));assert.throws(()=>assertOpen(path([key({after:2})])),/surrender/);});
test('initial focus without trusted owned click/initial owned keydown cannot pass',()=>{assert.throws(()=>assertOpen(path(undefined,{startTrustedClick:false})));assert.throws(()=>assertOpen(path([key({source:'parent',from:'protected-native'})])));});
test('fixed key count and wall-clock deadline cannot silently expand',()=>{assert.throws(()=>assertOpen(path(Array(UI06_LIMITS.keys+1).fill(key()))));assert.throws(()=>assertOpen(path(undefined,{elapsedMs:UI06_LIMITS.deadlineMs+1})));});
test('runtime observations reject arbitrary text/body/token-shaped fields',()=>{const input=observation();input.documents[1].key.body='not permitted';assert.throws(()=>reduceUI06Key(input),/fields/);const facts=reduceUI06ParentAX(tree());facts.token='not permitted';assert.throws(()=>assertUI06AXPhase(facts,false),/fields/);});
const intact=()=>Object.fromEntries(['document','plain','rich','fileInput','file','drafts','surfaces','frames','nativeAttributes','nativeNodes','location','actions'].map(k=>[k,true]));
test('all original document/editor/draft/File/surface identities and zero action delta required',()=>{assertUI06Continuity(intact());for(const property of Object.keys(intact()))assert.throws(()=>assertUI06Continuity({...intact(),[property]:false}),/continuity changed/);});
test('J3 has one subcase call after both drafts/File and before history, with helper hash checked at exit',()=>{const source=readFileSync(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');assert.equal(source.split('await runUI06KeyboardAX(').length,2);assert(source.indexOf('await runUI06KeyboardAX(')>source.indexOf("record('native-editor-switch-independent-drafts-original-two-nodes'"));assert(source.indexOf('await runUI06KeyboardAX(')<source.indexOf('// Native history controls execute'));assert(source.includes('ui06HelperChangedDuringRun=hash(await readFile(ui06Path))!==ui06HelperHash'));assert(source.includes('||report.ui06HelperChangedDuringRun||'));});

test('wrong-role background or closed frame is still exposed and cannot pass absence',()=>{for(const [open,target] of [[true,'history'],[true,'reading'],[false,'sidebar']]){const input=tree(open),node=input.nodes.find(n=>n.nodeId===target);node.ignored=false;node.role.value='generic';assert.throws(()=>phase(input,open));}});
test('closed native DOM sentinel alone cannot substitute for actual parent AX name',()=>{const input=tree();input.nodes.find(n=>n.nodeId==='reading').name.value='';assert.throws(()=>phase(input,false),/AX reading sentinel/);});
test('native history leak followed by synchronous close is not legitimate protected-native surrender',()=>{for(const target of ['history','native-background'])assert.throws(()=>key({before:2,after:0,target}),/masked/);});

test('transient masked history then composer cannot disappear behind a final snapshot',()=>{const input=observation();input.documents[0].events=[{target:'history',open:0},{target:'composer',open:0}];assert.throws(()=>reduceUI06Key(input),/transient masked/);});
test('monotonic deadline rejects clock regression and synchronous late positive result',async()=>{let t=5;const rollback=createUI06Deadline({now:()=>t,limit:10});await assert.rejects(rollback.run(()=>{t=4;return true;}),/regressed/);t=0;const late=createUI06Deadline({now:()=>t,limit:10});await assert.rejects(late.run(()=>{t=11;return true;}),/deadline/);});
test('silent CDP-shaped query is rejected without awaiting its completion',async()=>{const deadline=createUI06Deadline({limit:5});await assert.rejects(deadline.run(()=>new Promise(()=>{})),/deadline/);});
test('phase operations share one absolute deadline rather than renew per key',async()=>{let t=0;const deadline=createUI06Deadline({now:()=>t,limit:10});await deadline.run(()=>{t=6;return true;});await assert.rejects(deadline.run(()=>{t=10;return true;}),/deadline/);});

test('closed end state without actual protected-native focusin cannot prove surrender',()=>{const input=observation();input.documents[0].events=[];assert.throws(()=>reduceUI06Key(input),/surrender focus witness/);});

test('settings seed awaits actual expanded then collapsed renderer states under one deadline',async()=>{let state='false',pending=null;const log=[],settings={getAttribute:async()=>state,click:async()=>{assert.equal(pending,null);pending=state==='false'?'true':'false';log.push('click-'+pending);}},frame={getByRole:()=>settings,locator:selector=>({waitFor:async()=>{const expected=selector.includes('="true"]')?'true':'false';assert.equal(pending,expected);log.push('settled-'+expected);state=pending;pending=null;}})};await seedUI06Settings(frame,createUI06Deadline());assert.deepEqual(log,['click-true','settled-true','click-false','settled-false']);assert.equal(state,'false');});
test('missing expanded renderer state cannot proceed to the second seed click',async()=>{let clicks=0;const frame={getByRole:()=>({getAttribute:async()=> 'false',click:async()=>{clicks++;}}),locator:()=>({waitFor:()=>new Promise(()=>{})})};await assert.rejects(seedUI06Settings(frame,createUI06Deadline({limit:5})),/deadline/);assert.equal(clicks,1);});

// Execute the same browser callback against a bounded DOM double. This proves
// classifier/identity rules only, not browser sequential focus or paint.
function parentProbeFixture(){
 let opened=0,doc;const listeners=new Map(),mountId='fixture-owned-mount';
 function node(tag='DIV',attrs={}){const n={tagName:tag,attrs:{...attrs},dataset:{},children:[],parentElement:null,ownerDocument:null,isConnected:true,type:attrs.type??'',style:{display:'block',visibility:'visible',opacity:'1'},getAttribute(k){return this.attrs[k]??null;},getBoundingClientRect(){return {width:40,height:20};},contains(v){return v===this||this.children.some(c=>c.contains(v));},append(...values){for(const v of values){v.parentElement=this;v.ownerDocument=doc;this.children.push(v);}},closest(selector){if(selector==='nav')return this.tagName==='NAV'?this:this.parentElement?.closest(selector)??null;if(selector==='[data-va-owned]')return this.dataset.vaOwned?this:this.parentElement?.closest(selector)??null;if(selector==='[inert]')return this.attrs.inert!==undefined?this:this.parentElement?.closest(selector)??null;if(selector==='#composer,main header')return this===composer||this===header?this:this.parentElement?.closest(selector)??null;return null;},querySelectorAll(){return this.children.filter(c=>c.tagName==='BUTTON'&&c.type==='button'&&c.getAttribute('aria-label')==='返回工作空间'&&c.dataset.vaOwned);},querySelector(selector){return selector==='.message-body'?message:null;}};return n;}
 const body=node('BODY'),reading=node(),historyRoot=node('NAV'),historyNode=node('A'),otherHistory=node('A'),composer=node('FORM'),header=node('HEADER'),slot=node(),plain=node('TEXTAREA'),rich=node(),fileInput=node('INPUT'),message=node();
 const surfaces=[node('SECTION'),node('SECTION')],frames=[node('IFRAME'),node('IFRAME')];for(const s of surfaces)s.dataset.vaOwned=mountId;surfaces.forEach((s,i)=>s.append(frames[i]));
 const returnButton=()=>{const n=node('BUTTON',{type:'button','aria-label':'返回工作空间'});n.dataset.vaOwned=mountId;n.ownerDocument=doc;return n;};let button=returnButton();
 reading.append(message);historyRoot.append(historyNode,otherHistory);header.append(slot);slot.append(button);composer.append(plain,rich,fileInput);body.append(historyRoot,header,reading,composer,...surfaces);
 const historySelector='fixture-history',queries=new Map([['#reading',reading],[historySelector,historyNode],['aside nav[aria-label="Chat history"] a[href="/c/44444444-4444-4444-8444-444444444444"]',otherHistory],['#composer',composer],['main header .navigation-slot',slot],...['workspace','sidebar'].map((role,i)=>[`[data-va-owned] iframe[src="chrome-extension://fixture/${role}.html"]`,frames[i]])]);
 doc={body,activeElement:rich,hasFocus:()=>true,querySelector:s=>queries.get(s)??null,querySelectorAll:s=>s==='[data-va-owned][popover]'?surfaces:s==='[data-va-owned]:popover-open'?surfaces.slice(0,opened):[],addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
 const assign=n=>{n.ownerDocument=doc;for(const c of n.children)assign(c);};assign(body);
 const context={document:doc,location:{href:'http://fixture/'},history:{length:1},getComputedStyle:n=>n.style,j3OriginalPlain:plain,j3OriginalRich:rich,j3OriginalFileInput:fileInput,j3OriginalFile:{},j3OriginalDocument:doc};
 runInNewContext(`(${installUI06ParentProbe.toString()})({historySelector:'fixture-history',extensionId:'fixture'})`,context);
 return {doc,rich,slot,frames,button,returnButton,probe:context.__ui06Probe,listeners,setOpen:n=>{opened=n;},replace:()=>{button.isConnected=false;slot.children=[];button=returnButton();slot.append(button);return button;},event:(type,target)=>{doc.activeElement=target;listeners.get(type)?.({key:'Tab',isTrusted:true,shiftKey:false,target});}};
}
function returnKey(f,target=f.button){f.probe.reset();f.event('keydown',f.rich);f.event('focusin',target);f.event('keyup',target);const input=observation({before:0,after:0,source:'parent',from:'composer',target:'owned-return'});input.documents[0]={document:'parent',...f.probe.read()};return reduceUI06Key(input);}
test('actual callback recognizes only the current visible closed parent return control',()=>{const f=parentProbeFixture(),value=returnKey(f);assert.equal(value.target,'owned-return');assert.equal(value.diagnostic.parentFocus,'owned-return');assert.deepEqual(value.diagnostic.hasFocus,[true,false,false]);assert.equal(value.diagnostic.keyups[0].key.target,'owned-return');const last=key({before:0,after:0,source:'parent',from:'owned-return',target:'history'});assertUI06Path(path([value,last],{start:'composer',startOpen:0,startTrustedClick:false}),{direction:'Tab',target:'history',open:false});f.probe.cleanup();assert.equal(f.listeners.size,0);});
for(const [name,change] of Object.entries({strippedOwner:f=>{delete f.button.dataset.vaOwned;},detached:f=>{f.button.isConnected=false;},replaced:f=>f.replace(),duplicate:f=>f.slot.append(f.returnButton()),iframe:f=>{f.button.tagName='IFRAME';},wrongMount:f=>{f.button.dataset.vaOwned='other';},wrongLabel:f=>{f.button.attrs['aria-label']='other';},wrongSlot:f=>{f.button.parentElement=f.doc.body;},hidden:f=>{f.button.style.visibility='hidden';},noLayout:f=>{f.button.getBoundingClientRect=()=>({width:0,height:0});},inert:f=>{f.button.attrs.inert='';}}))test('actual return classifier rejects '+name,()=>{const f=parentProbeFixture();change(f);assert.throws(()=>returnKey(f),/closed owned/);});
test('an owned return cannot be classified while either surface is open',()=>{const f=parentProbeFixture();f.setOpen(2);f.doc.activeElement=f.button;assert.equal(f.probe.read().focus,'owned-other');});
test('return identity refreshes only on observed native surrender, not arbitrary closed replacement',()=>{const f=parentProbeFixture();f.setOpen(2);f.probe.read();const next=f.replace();f.setOpen(0);f.event('focusin',f.rich);assert.equal(returnKey(f,next).target,'owned-return');const other=f.replace();assert.throws(()=>returnKey(f,other),/closed owned/);});
test('return enum never grants child or still-open parent an exception',()=>{for(const bad of [{source:'workspace',from:'owned-return',before:0,after:0},{source:'parent',from:'owned-return',before:2,after:2,target:'owned-return'},{source:'parent',from:'composer',before:2,after:2,target:'owned-return'}])assert.throws(()=>key(bad),/return/);});
test('focus and keyup diagnostics remain bounded and cannot substitute for trusted keydown',()=>{const raw=observation();raw.documents.forEach(d=>{d.hasFocus=false;});const value=reduceUI06Key(raw);assert.deepEqual(value.diagnostic.hasFocus,[false,false,false]);assert(value.diagnostic.keyups.every(u=>u.count===0));raw.documents[0].ups=1;raw.documents[0].up={direction:'Tab',trusted:true,target:'composer',rawBody:'forbidden'};assert.throws(()=>reduceUI06Key(raw),/fields/);});
test('backward and restored closed observations precede the unchanged forward case',()=>{const source=readFileSync(new URL('./ui06-keyboard-ax.mjs',import.meta.url),'utf8');assert(source.includes("for(const direction of ['Shift+Tab','Tab'])"));assert(source.includes("await walk('Shift+Tab','history',false);await walk('Tab','composer',false);await ax(false);}"));assert(source.indexOf("name:'显示原生列表'",source.indexOf("if(direction==='Shift+Tab')"))<source.indexOf("await walk('Shift+Tab','history',false)"));assert.deepEqual(UI06_LIMITS,{keys:64,deadlineMs:15000});assert(source.includes("await walk(direction,'composer',true,true)"));});

test('a stripped old return identity cannot become native after reopen and replacement',()=>{const f=parentProbeFixture();f.setOpen(2);f.probe.read();const next=f.replace();f.setOpen(0);f.event('focusin',f.rich);assert.equal(returnKey(f,next).target,'owned-return');delete f.button.dataset.vaOwned;assert.throws(()=>returnKey(f,f.button),/closed owned/);});


test('continuous sidebar keeps history masked while original reading and composer are accessible',()=>{
 const input=tree(false);for(const n of input.nodes){if(['history','historyOther'].includes(n.nodeId))n.ignored=true;if(n.nodeId==='sidebar')n.ignored=false;}
 const facts=reduceUI06ParentAX(input);assertUI06AXPhase(facts,false,true);
 for(const patch of [{history:true},{sidebar:false},{workspace:true},{reading:false},{composer:false}])assert.throws(()=>assertUI06AXPhase({...facts,...patch},false,true));
});
test('trusted composer surrender closes only workspace, not the continuous sidebar',()=>{
 const raw=observation({after:1});raw.documents[0].events=[{target:'composer',open:1}];
 const k=reduceUI06Key({...raw,sidebarContinuous:true});assertUI06Path(path([k]),{direction:'Tab',target:'composer',open:true,sidebarContinuous:true});
 const missing=structuredClone(raw);missing.documents[0].events=[];assert.throws(()=>reduceUI06Key({...missing,sidebarContinuous:true}),/surrender focus witness/);
 const leaked=structuredClone(raw);leaked.documents[0].focus='workspace';assert.throws(()=>reduceUI06Key({...leaked,sidebarContinuous:true}),/closed workspace/);
 const hiddenSide=observation();const allClosed=reduceUI06Key({...hiddenSide,sidebarContinuous:true});assert.throws(()=>assertUI06Path(path([allClosed]),{direction:'Tab',target:'composer',open:true,sidebarContinuous:true}),/preserving/);
 for(const target of ['history','native-background']){const bad=structuredClone(raw);bad.documents[0].events=[{target,open:1}];assert.throws(()=>reduceUI06Key({...bad,sidebarContinuous:true}),/masked/);}
});

test('continuous sidebar recovery is a bounded surface observation, never a workspace reopening or surrender witness',()=>{
 const raw=observation({before:0,after:1,source:'parent',from:'protected-native'});raw.sidebarContinuous=true;
 raw.documents[0].events=[{target:'composer',open:0},{target:'composer',open:1,observation:'surface-snapshot'}];
 assert.equal(reduceUI06Key(raw).after,1);const focusRecovery=structuredClone(raw);delete focusRecovery.documents[0].events[1].observation;assert.equal(reduceUI06Key(focusRecovery).after,1);
 for(const change of [r=>r.documents[0].events.pop(),r=>r.documents[0].events[1].open=2,r=>r.documents[0].events[1].target='history',r=>r.sidebarContinuous=false]){const bad=structuredClone(raw);change(bad);assert.throws(()=>reduceUI06Key(bad));}
 const unwitnessed=observation({after:1});unwitnessed.documents[0].events=[{target:'composer',open:1,observation:'surface-snapshot'}];assert.throws(()=>reduceUI06Key({...unwitnessed,sidebarContinuous:true}),/cannot prove/);
});

test('a continuous sidebar cannot conceal keyboard delivery to the hidden workspace',()=>{
 const raw=observation({before:1,after:1,source:'workspace'});assert.throws(()=>reduceUI06Key({...raw,sidebarContinuous:true}),/hidden workspace/);
 const start=observation({after:1});start.documents[0].events=[{target:'composer',open:1}];const first=reduceUI06Key({...start,sidebarContinuous:true});
 assert.throws(()=>assertUI06Path(path([first,{...first,before:1,nativeFocus:[]}]),{direction:'Tab',target:'composer',open:true,sidebarContinuous:true}),/hidden workspace/);
});
