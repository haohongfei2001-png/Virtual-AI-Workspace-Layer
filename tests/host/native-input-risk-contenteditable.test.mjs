import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeInputRisk} from '../../src/host/native-input-risk.mjs';
function fixture(){
 const map=new Map(),doc={querySelectorAll:s=>map.get(s)??[]};let writes=0;
 const form={tagName:'FORM',ownerDocument:doc,isConnected:true,isContentEditable:false,querySelectorAll:selector=>selector==='textarea,[contenteditable]'?[editor]:selector==='input[type="file"]'?[files]:[],contains:n=>n.parent===form};
 const attrs={role:'textbox',contenteditable:'true'},editor={tagName:'DIV',ownerDocument:doc,isConnected:true,parent:form,parentElement:form,isContentEditable:true,childElementCount:0,textContent:'',getAttribute:k=>attrs[k]??null,setAttribute(){writes++;throw Error('must-not-write');}};
 const files={tagName:'INPUT',type:'file',ownerDocument:doc,isConnected:true,parent:form,files:{length:0}},root={ownerDocument:doc,isConnected:true,querySelectorAll:()=>[],contains:()=>false};
 map.set('#form',[form]);map.set('#editor',[editor]);map.set('#files',[files]);map.set('#root',[root]);
 const profile={inputRisk:{formSelector:'#form',editorSelector:'#editor',filesSelector:'#files',editorKinds:['textarea','contenteditable'],risks:Object.fromEntries(['upload','generation','voice','canvas'].map(k=>[k,{rootSelector:'#root',activeSelector:'.'+k}])),complete:Object.fromEntries(['composer','attachment','upload','generation','voice','canvas'].map(k=>[k,true]))}};
 return {doc,map,form,editor,attrs,files,profile,read:()=>createNativeInputRisk({document:doc,profile})(),writes:()=>writes};
}
test('explicit opted-in rich editor distinguishes empty from rich-only draft without files',()=>{
 const f=fixture();assert.deepEqual(f.read(),{state:'clear',flags:[]});for(const text of ['PRIVATE_RICH_ONLY',' ','\n','\u200b','\u00a0']){f.editor.textContent=text;const result=f.read();assert.deepEqual(result,{state:'unsaved',flags:['composer']});assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(f.files.files.length,0);}assert.equal(f.writes(),0);
});
for(const attribute of ['true','plaintext-only'])test(`explicit ${attribute} rich boundary is supported`,()=>{const f=fixture();f.attrs.contenteditable=attribute;assert.equal(f.read().state,'clear');f.editor.textContent='draft';assert.deepEqual(f.read(),{state:'unsaved',flags:['composer']});});
test('empty rich structure with element children is conservatively unsaved',()=>{const f=fixture();f.editor.childElementCount=1;assert.deepEqual(f.read(),{state:'unsaved',flags:['composer']});});
test('legacy default does not opt arbitrary DIV into empty composer authority',()=>{const f=fixture();delete f.profile.inputRisk.editorKinds;assert.deepEqual(f.read(),{state:'unknown',flags:[]});f.editor.tagName='TEXTAREA';f.editor.value='';assert.deepEqual(f.read(),{state:'clear',flags:[]});});
for(const kinds of [[],['contenteditable','contenteditable'],['div'],['textarea','other'],null,'contenteditable',[null]])test(`invalid editorKinds ${JSON.stringify(kinds)} stays unknown`,()=>{const f=fixture();f.profile.inputRisk.editorKinds=kinds;assert.deepEqual(f.read(),{state:'unknown',flags:[]});});
for(const mutation of ['role-only','inherited-editable','false-attribute','runtime-false','wrong-role','wrong-tag','duplicate-editor','detached','outside','foreign'])test(`rich boundary ${mutation} cannot certify clear`,()=>{
 const f=fixture();if(mutation==='role-only'||mutation==='inherited-editable')delete f.attrs.contenteditable;if(mutation==='role-only')f.editor.isContentEditable=false;if(mutation==='false-attribute')f.attrs.contenteditable='false';if(mutation==='runtime-false')f.editor.isContentEditable=false;if(mutation==='wrong-role')f.attrs.role='button';if(mutation==='wrong-tag')f.editor.tagName='SPAN';if(mutation==='duplicate-editor')f.map.set('#editor',[f.editor,f.editor]);if(mutation==='detached')f.editor.isConnected=false;if(mutation==='outside')f.editor.parent=null;if(mutation==='foreign')f.editor.ownerDocument={};assert.deepEqual(f.read(),{state:'unknown',flags:[]});assert.equal(f.writes(),0);
});
for(const mutation of ['replace','throw','revoke-attribute','revoke-runtime','change-role'])test(`rich text read ${mutation} cannot certify stale boundary`,()=>{
 const f=fixture(),replacement={...f.editor,textContent:''};Object.defineProperty(f.editor,'textContent',{get(){if(mutation==='throw')throw Error('PRIVATE_TEXT');if(mutation==='replace')f.map.set('#editor',[replacement]);if(mutation==='revoke-attribute')f.attrs.contenteditable='false';if(mutation==='revoke-runtime')f.editor.isContentEditable=false;if(mutation==='change-role')f.attrs.role='button';return '';},set(){throw Error('must-not-write');}});assert.deepEqual(f.read(),{state:'unknown',flags:[]});assert.equal(f.writes(),0);
});
test('editorKinds is copied rather than following later profile mutation',()=>{const f=fixture(),read=createNativeInputRisk({document:f.doc,profile:f.profile});f.profile.inputRisk.editorKinds.splice(0,2,'textarea');assert.deepEqual(read(),{state:'clear',flags:[]});});

test('rich boundary with editable parent cannot certify independent composer',()=>{const f=fixture();f.form.isContentEditable=true;assert.deepEqual(f.read(),{state:'unknown',flags:[]});});
for(const count of [NaN,Infinity,-1,0.5,'0',undefined])test(`invalid rich childElementCount ${String(count)} remains unknown`,()=>{const f=fixture();f.editor.childElementCount=count;assert.deepEqual(f.read(),{state:'unknown',flags:[]});});
test('throwing rich childElementCount getter remains unknown without writes',()=>{const f=fixture();Object.defineProperty(f.editor,'childElementCount',{get(){throw Error('PRIVATE STRUCTURE');}});assert.deepEqual(f.read(),{state:'unknown',flags:[]});assert.equal(f.writes(),0);});
