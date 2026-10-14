import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeInputRisk} from '../../src/host/native-input-risk.mjs';
// Explicit offline complete profile only; no assertion about live ChatGPT DOM.
function fixture(){
 const map=new Map(),doc={querySelectorAll:s=>map.get(s)??[]};let retained=[],discovered=[];
 const node=(tag,parent=null,attrs={})=>({tagName:tag,parent,ownerDocument:doc,isConnected:true,getAttribute:k=>Object.hasOwn(attrs,k)?attrs[k]:null,contains(n){for(let p=n?.parent;p;p=p.parent)if(p===this)return true;return false;},querySelectorAll:()=>[]});
 const form=node('FORM'),plain=node('TEXTAREA',form),richAttrs={role:'textbox',contenteditable:'true'},rich=node('DIV',form,richAttrs),files=node('INPUT',form),root=node('MAIN');
 plain.value='';plain.hidden=true;rich.textContent='';rich.childElementCount=0;rich.isContentEditable=true;files.type='file';files.files={length:0};retained=[plain,rich];discovered=[plain,rich];form.querySelectorAll=s=>s==='textarea,[contenteditable]'?discovered:[];
 map.set('#form',[form]);map.set('#active',[rich]);map.set('#files',[files]);map.set('#root',[root]);doc.querySelectorAll=s=>s==='#drafts'?retained:map.get(s)??[];
 const profile={inputRisk:{formSelector:'#form',editorSelector:'#active',filesSelector:'#files',editorKinds:['textarea','contenteditable'],draftEditorsSelector:'#drafts',complete:Object.fromEntries(['composer','attachment','upload','generation','voice','canvas'].map(k=>[k,true])),risks:Object.fromEntries(['upload','generation','voice','canvas'].map(k=>[k,{rootSelector:'#root',activeSelector:'.'+k}]))}};
 return {doc,map,form,plain,rich,richAttrs,files,root,profile,node,read:()=>createNativeInputRisk({document:doc,profile}),retained:v=>retained=v,discovered:v=>discovered=v};
}
test('explicit complete retained editors aggregate hidden plain and active rich drafts without leaking contents',()=>{
 const f=fixture(),read=f.read();assert.deepEqual(read(),{state:'clear',flags:[]});f.plain.value='HIDDEN_PRIVATE_DRAFT';assert.deepEqual(read(),{state:'unsaved',flags:['composer']});f.rich.textContent='RICH_PRIVATE_DRAFT';assert.deepEqual(read(),{state:'unsaved',flags:['composer']});assert(!JSON.stringify(read()).includes('PRIVATE'));f.map.set('#active',[f.plain]);f.rich.hidden=true;f.plain.hidden=false;f.plain.value='';assert.equal(read().state,'unsaved');
});
test('omitted retained selector cannot clear a form with another retained editor',()=>{const f=fixture();delete f.profile.inputRisk.draftEditorsSelector;f.plain.value='hidden draft';assert.deepEqual(f.read()(),{state:'unknown',flags:[]});f.plain.value='';assert.equal(f.read()().state,'unknown');});
for(const text of [' ','\n','\u00a0','\u200b'])test('rich whitespace or invisible text is unsaved '+JSON.stringify(text),()=>{const f=fixture();f.rich.textContent=text;assert.deepEqual(f.read()(),{state:'unsaved',flags:['composer']});});
test('empty text with rich element children remains unsaved',()=>{const f=fixture();f.rich.childElementCount=1;assert.equal(f.read()().state,'unsaved');});
for(const kind of ['empty','duplicate','too-many','missing-active','outside','detached','foreign'])test('invalid retained editor set '+kind+' fails closed',()=>{
 const f=fixture();if(kind==='empty')f.retained([]);if(kind==='duplicate')f.retained([f.plain,f.rich,f.rich]);if(kind==='too-many')f.retained([f.plain,f.rich,...Array.from({length:31},()=>Object.assign(f.node('TEXTAREA',f.form),{value:''}))]);if(kind==='missing-active')f.retained([f.plain]);if(kind==='outside')f.plain.parent=null;if(kind==='detached')f.plain.isConnected=false;if(kind==='foreign')f.plain.ownerDocument={};assert.deepEqual(f.read()(),{state:'unknown',flags:[]});
});
test('uncovered independent editable descendants cannot produce clear',()=>{for(const tag of ['TEXTAREA','DIV']){const f=fixture(),extra=f.node(tag,f.form,{contenteditable:'true'});f.discovered([f.plain,f.rich,extra]);assert.equal(f.read()().state,'unknown');}});
test('nested rich descendants and explicit contenteditable=false do not create extra editors',()=>{const f=fixture(),nested=f.node('SPAN',f.rich,{contenteditable:'true'}),disabled=f.node('DIV',f.form,{contenteditable:'false'});f.rich.childElementCount=1;f.discovered([f.plain,f.rich,nested,disabled]);assert.deepEqual(f.read()(),{state:'unsaved',flags:['composer']});f.rich.childElementCount=0;f.discovered([f.plain,f.rich,disabled]);assert.equal(f.read()().state,'clear');});
for(const change of [f=>{f.richAttrs.role='button';},f=>{f.richAttrs.contenteditable='false';},f=>{f.rich.isContentEditable=false;},f=>{f.rich.tagName='SPAN';},f=>{f.rich.childElementCount=NaN;}])test('rich qualification and element count are mandatory',()=>{const f=fixture();change(f);assert.equal(f.read()().state,'unknown');});
test('plaintext-only opt-in is accepted only with actual editable qualification',()=>{const f=fixture();f.richAttrs.contenteditable='plaintext-only';assert.equal(f.read()().state,'clear');f.rich.isContentEditable=false;assert.equal(f.read()().state,'unknown');});
test('end-of-read retained set replacement and rich qualification drift fail closed',()=>{for(const kind of ['set','role']){const f=fixture();Object.defineProperty(f.files,'files',{get(){if(kind==='set')f.retained([f.rich]);else f.richAttrs.role='button';return {length:0};}});assert.equal(f.read()().state,'unknown');}});
test('read exceptions cannot certify clear',()=>{for(const key of ['textContent','childElementCount']){const f=fixture();Object.defineProperty(f.rich,key,{get(){throw Error('PRIVATE');}});assert.deepEqual(f.read()(),{state:'unknown',flags:[]});}});
for(const editorKinds of [[],['textarea','textarea'],['other'],['contenteditable',,'textarea'],'contenteditable'])test('invalid editorKinds '+JSON.stringify(editorKinds)+' cannot authorize clear',()=>{const f=fixture();f.profile.inputRisk.editorKinds=editorKinds;assert.equal(f.read()().state,'unknown');});
test('editorKinds omission remains textarea-only; profile snapshot cannot expand readers',()=>{const f=fixture();delete f.profile.inputRisk.editorKinds;const read=f.read();assert.equal(read().state,'unknown');f.profile.inputRisk.editorKinds=['textarea','contenteditable'];assert.equal(read().state,'unknown');assert.equal(createNativeInputRisk({document:f.doc})().state,'unknown');});

test('editorKinds index accessors are rejected without invoking configuration getters',()=>{
 const f=fixture();let reads=0;const editorKinds=[];
 Object.defineProperty(editorKinds,'0',{enumerable:true,configurable:true,get(){reads++;return reads<=2?'textarea':'contenteditable';}});
 f.profile.inputRisk.editorKinds=editorKinds;
 const read=f.read();assert.deepEqual(read(),{state:'unknown',flags:[]});assert.equal(reads,0,'configuration accessors cannot run during validation or snapshot');
});
test('declared textarea cannot cover a nested independent editor draft through its empty value',()=>{
 for(const tag of ['TEXTAREA','DIV']){
  const f=fixture(),nested=f.node(tag,f.plain,{role:'textbox',contenteditable:'true'});
  nested.value='NESTED_PRIVATE_DRAFT';nested.textContent='NESTED_PRIVATE_DRAFT';nested.childElementCount=0;nested.isContentEditable=true;
  f.plain.value='';f.discovered([f.plain,f.rich,nested]);
  assert.deepEqual(f.read()(),{state:'unknown',flags:[]},tag+' draft is outside declared textarea value boundary');
 }
});
