import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// Structural geometry and ownership oracle; actual browser zoom remains separate.
async function fixture(){
 let doc;const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,children:[],events:new Map(),rect:{left:0,top:0,right:0,bottom:0,width:0,height:0},addEventListener(k,f){this.events.set(k,f);},removeEventListener(k){this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return this.rect;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){for(const n of v){n.parentElement=this;n.parentNode=this;}this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener(){},removeEventListener(){}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element(),events=[];composer.rect={left:0,top:300,right:800,bottom:400,width:800,height:100};header.rect={left:0,top:0,right:800,bottom:40,width:800,height:40};
 reading.attrs.class='native-reading';history.attrs.style='color:red';composer.attrs.role='textbox';composer.value='UNSENT DRAFT';
 const navigationSlot=element();const inspection={navigationSlot,ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:200,y:40,width:400,height:200},sidebarRect:{x:0,y:40,width:180,height:200}};
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'}),handle=await surface.mount({binding:{documentToken:'doc'}},inspection,{onSurrender:e=>events.push(e)});
 return {navigationSlot,doc,element,surface,handle,inspection,events,reading,history,composer,header,nodes:doc.body.children,next:()=>({...inspection,readingRect:{x:120,y:40,width:300,height:180},sidebarRect:{x:0,y:40,width:100,height:180}})};
}
const snapshot=f=>[f.reading,f.history,f.composer,f.header].map(n=>({attrs:{...n.attrs},style:{...n.style},value:n.value}));
const styles=f=>f.nodes.map(n=>({...n.style}));

const context=()=>({binding:{documentToken:'renewed_document'}});
const next=f=>({...f.next()});
function rejectsRebind(f,inspection=next(f),ctx=context()){
 assert.throws(()=>f.surface.rebind(f.handle,ctx,inspection),/invalid-mount-rebind/);assert.equal(f.surface.frames(f.handle).length,2);
}
// Structural ownership doubles only; actual Chrome layout remains separate.
test('closed rebind preserves exact iframes and native nodes while replacing handle authority',async()=>{
 const f=await fixture(),before=snapshot(f),nodes=[...f.nodes],frames=f.surface.frames(f.handle),css=f.doc.head.children[0],cssText=css.textContent;
 const replacement=f.surface.rebind(f.handle,context(),next(f));assert.ok(replacement);assert.equal(typeof replacement.then,'undefined');assert(Object.isFrozen(replacement));
 assert.notEqual(replacement,f.handle);assert.deepEqual(replacement,{id:f.handle.id,documentToken:'renewed_document',regionEpoch:1});
 assert.deepEqual(f.surface.frames(replacement),frames);for(let i=0;i<frames.length;i++)assert.equal(f.surface.frames(replacement)[i].frame,frames[i].frame);
 assert.deepEqual(f.doc.body.children,nodes);for(let i=0;i<nodes.length;i++)assert.equal(f.doc.body.children[i],nodes[i]);assert.equal(f.doc.head.children[0],css);assert.equal(css.textContent,cssText);assert.deepEqual(snapshot(f),before);assert.deepEqual(f.surface.visibility(replacement),{workspace:false,sidebar:false});
 for(const operation of ['frames','showWorkspace','showReading','suspend','dispose'])assert.throws(()=>f.surface[operation](f.handle),/stale-mount/);
 assert.equal(f.surface.showWorkspace(replacement),true);assert.deepEqual(f.surface.visibility(replacement),{workspace:true,sidebar:true});f.surface.dispose(replacement);
});
for(const mode of ['workspace','sidebar','both'])test('rebind refuses '+mode+' still open',async()=>{
 const f=await fixture();if(mode==='both')f.surface.showWorkspace(f.handle);else f.nodes[mode==='workspace'?0:1].showPopover();rejectsRebind(f);f.surface.dispose(f.handle);
});
for(const mode of ['frame-detached','frame-reparented','surface-detached','surface-owner','style-detached','style-owner','style-document','style-text','reading-marker','history-marker','native-style','native-class','native-hidden','native-aria-hidden','native-detached'])test('rebind rejects '+mode+' integrity loss',async()=>{
 const f=await fixture();const frame=f.surface.frames(f.handle)[0].frame,style=f.doc.head.children[0];
 if(mode==='frame-detached')frame.isConnected=false;
 if(mode==='frame-reparented')frame.parentElement=f.doc.body;
 if(mode==='surface-detached')f.nodes[0].isConnected=false;
 if(mode==='surface-owner')f.nodes[0].dataset.vaOwned='other';
 if(mode==='style-detached')style.isConnected=false;
 if(mode==='style-owner')style.dataset.vaOwned='other';
 if(mode==='style-document')style.ownerDocument={};
 if(mode==='style-text')style.textContent+='/* changed */';
 if(mode==='reading-marker')f.reading.setAttribute('data-va-mask-workspace','other');
 if(mode==='history-marker')f.history.removeAttribute('data-va-mask-sidebar');
 if(mode==='native-style')f.reading.setAttribute('style','display:none');
 if(mode==='native-class')f.reading.setAttribute('class','replacement');
 if(mode==='native-hidden')f.history.setAttribute('hidden','');
 if(mode==='native-aria-hidden')f.history.setAttribute('aria-hidden','true');
 if(mode==='native-detached')f.reading.isConnected=false;
 rejectsRebind(f);f.surface.dispose(f.handle);
});
for(const field of ['reading','header','composer','historyMaskRoots','protectedRegions','navigationSlot'])test('rebind rejects replaced '+field+' node',async()=>{
 const f=await fixture(),inspection=next(f);inspection[field]=['historyMaskRoots','protectedRegions'].includes(field)?[f.element()]:f.element();rejectsRebind(f,inspection);f.surface.dispose(f.handle);
});
for(const patch of [{ok:false},{viewMask:'unsupported'},{sidebarRect:null},{readingRect:{x:0,y:300,width:50,height:50}},{readingRect:{x:0,y:40,width:NaN,height:10}}])test('rebind rejects unsafe fresh geometry '+JSON.stringify(patch),async()=>{
 const f=await fixture(),before=styles(f);rejectsRebind(f,{...next(f),...patch});assert.deepEqual(styles(f),before);f.surface.dispose(f.handle);
});
for(const ctx of [null,{}, {binding:{}}, {binding:{documentToken:''}}])test('rebind rejects missing document context '+JSON.stringify(ctx),async()=>{
 const f=await fixture();rejectsRebind(f,next(f),ctx);f.surface.dispose(f.handle);
});

test('rebind rejects changed region epoch without minting replacement authority',async()=>{const f=await fixture();rejectsRebind(f,{...next(f),regionEpoch:2});f.surface.dispose(f.handle);});

test('read-only rebind validity accepts the replacement and rejects the original handle',async()=>{
 const f=await fixture(),inspection=next(f),replacement=f.surface.rebind(f.handle,context(),inspection);
 assert.equal(f.surface.isRebindCurrent(f.handle,inspection),false);assert.equal(f.surface.isRebindCurrent(replacement,inspection),true);
 const before={native:snapshot(f),owned:styles(f),open:f.nodes.map(node=>node.open)};
 assert.equal(f.surface.isRebindCurrent(replacement,inspection),true);assert.deepEqual({native:snapshot(f),owned:styles(f),open:f.nodes.map(node=>node.open)},before);
 f.surface.dispose(replacement);assert.equal(f.surface.isRebindCurrent(replacement,inspection),false);
});
for(const tamper of ['style','mask','native-class','open'])test('read-only rebind validity rejects '+tamper+' without writes or clearing masks',async()=>{
 const f=await fixture(),inspection=next(f),replacement=f.surface.rebind(f.handle,context(),inspection),style=f.doc.head.children[0];
 if(tamper==='style')style.textContent+='/* externally modified */';
 if(tamper==='mask')f.reading.setAttribute('data-va-mask-workspace','replacement_owner');
 if(tamper==='native-class')f.reading.setAttribute('class','external_change');
 if(tamper==='open')f.nodes[0].showPopover();
 const before={native:snapshot(f),owned:styles(f),css:style.textContent,open:f.nodes.map(node=>node.open)},restores=[];let writes=0;
 const trap=(object,key)=>{const old=object[key];object[key]=()=>{writes++;throw Error('read-only predicate attempted mutation');};restores.push(()=>object[key]=old);};
 for(const node of [...f.nodes,f.reading,f.history,style])for(const key of ['setAttribute','removeAttribute','hidePopover','remove'])trap(node,key);
 for(const node of f.nodes){const old=node.style;node.style=new Proxy(old,{set(){writes++;throw Error('predicate geometry write');}});restores.push(()=>node.style=old);}
 assert.equal(f.surface.isRebindCurrent(replacement,inspection),false);assert.equal(writes,0);
 assert.deepEqual({native:snapshot(f),owned:styles(f),css:style.textContent,open:f.nodes.map(node=>node.open)},before);
 for(const restore of restores)restore();f.surface.dispose(replacement);
});

for(const mode of ['detached','other-document'])test('read-only rebind validity refuses '+mode+' return slot',async()=>{
 const f=await fixture(),inspection=next(f),replacement=f.surface.rebind(f.handle,context(),inspection);
 if(mode==='detached')inspection.navigationSlot.isConnected=false;else inspection.navigationSlot.ownerDocument={};
 assert.equal(f.surface.isRebindCurrent(replacement,inspection),false);assert.throws(()=>f.surface.rebind(replacement,context(),inspection),/invalid-mount-rebind/);f.surface.dispose(replacement);
});
