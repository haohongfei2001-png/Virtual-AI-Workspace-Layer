import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeInputRisk} from '../../src/host/native-input-risk.mjs';
// Local DOM double for declared complete attachment boundaries, not a live host claim.
function fixture(){
 const map=new Map(),doc={querySelectorAll:s=>map.get(s)??[]};let inputs=[];
 const node=(tag,parent=null)=>({tagName:tag,parent,ownerDocument:doc,isConnected:true,contains(other){for(let p=other?.parent;p;p=p.parent)if(p===this)return true;return false;},querySelectorAll:()=>[]});
 const form=node('FORM'),editor=node('TEXTAREA',form),files=node('INPUT',form),root=node('MAIN');editor.value='';files.type='file';files.files={length:0};inputs=[files];
 form.querySelectorAll=s=>s==='input[type="file"]'?inputs:s==='textarea,[contenteditable]'?[editor]:[];
 map.set('#form',[form]);map.set('#editor',[editor]);map.set('#files',[files]);map.set('#root',[root]);
 const profile={inputRisk:{formSelector:'#form',editorSelector:'#editor',filesSelector:'#files',complete:Object.fromEntries(['composer','attachment','upload','generation','voice','canvas'].map(k=>[k,true])),risks:Object.fromEntries(['upload','generation','voice','canvas'].map(k=>[k,{rootSelector:'#root',activeSelector:'.'+k}]))}};
 return {doc,map,form,editor,files,node,inputs:v=>{inputs=v;},read:createNativeInputRisk({document:doc,profile})};
}
const unknown={state:'unknown',flags:[]};
test('unique empty attachment boundary is clear and selected files expose only attachment flag',()=>{const f=fixture();assert.deepEqual(f.read(),{state:'clear',flags:[]});let privateReads=0;f.files.files={length:1,get 0(){privateReads++;throw Error('private file');},item(){privateReads++;throw Error('private file');},*[Symbol.iterator](){privateReads++;throw Error('private file');}};assert.deepEqual(f.read(),{state:'unsaved',flags:['attachment']});assert.equal(privateReads,0);});
for(const kind of ['empty','selected','hidden-empty','hidden-selected'])test('narrow selector cannot certify a form with an extra file input: '+kind,()=>{const f=fixture(),extra=f.node('INPUT',f.form);extra.type='file';extra.hidden=kind.startsWith('hidden');extra.files={length:kind.endsWith('selected')?1:0};f.inputs([f.files,extra]);assert.deepEqual(f.read(),unknown);});
for(const kind of ['missing','duplicate','outside','detached','foreign','wrong-type','replacement'])test('invalid form attachment set is unknown: '+kind,()=>{const f=fixture();if(kind==='missing')f.inputs([]);if(kind==='duplicate')f.inputs([f.files,f.files]);if(kind==='outside')f.files.parent=null;if(kind==='detached')f.files.isConnected=false;if(kind==='foreign')f.files.ownerDocument={};if(kind==='wrong-type')f.files.type='text';if(kind==='replacement'){const n=f.node('INPUT',f.form);n.type='file';n.files={length:0};f.inputs([n]);}assert.deepEqual(f.read(),unknown);});
for(const kind of ['add','replace','detach','move','foreign','type'])test('attachment boundary changes during FileList read cannot certify clear: '+kind,()=>{const f=fixture();Object.defineProperty(f.files,'files',{get(){if(kind==='add'||kind==='replace'){const extra=f.node('INPUT',f.form);extra.type='file';extra.files={length:1};f.inputs(kind==='add'?[f.files,extra]:[extra]);}if(kind==='detach')f.files.isConnected=false;if(kind==='move')f.files.parent=null;if(kind==='foreign')f.files.ownerDocument={};if(kind==='type')f.files.type='text';return {length:0};}});assert.deepEqual(f.read(),unknown);});
test('attachment discovery exception fails closed without reading file names',()=>{const f=fixture();const original=f.form.querySelectorAll;f.form.querySelectorAll=s=>{if(s==='input[type="file"]')throw Error('private DOM failure');return original(s);};assert.deepEqual(f.read(),unknown);});
