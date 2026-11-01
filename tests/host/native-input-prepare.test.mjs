/** Trusted-event DOM doubles only; physical IME and actual host gesture semantics are NOT certified. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeSendIntentObserver} from '../../src/host/native-send-intent.mjs';
function fixture(configured=true,enterSends=true,prepare=false,first=false,rich=false){const listeners=new Map(),intents=[],preparations=[],firstIntents=[];let time=0,id=0;const doc={defaultView:{getComputedStyle:n=>n.style},addEventListener(type,fn,options){assert.deepEqual(options,{capture:true,passive:true});listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);},querySelectorAll:s=>selected[s]};class Node{constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.isConnected=true;this.parentElement=null;this.children=[];this.attrs={};this.style={display:'block',visibility:'visible'};this.type='';}contains(n){return this.children.includes(n);}getAttribute(k){return this.attrs[k]??null;}getClientRects(){return [{}];}matches(s){assert.equal(s,':disabled');return !!this.disabledAncestor;}get value(){throw Error('draft read');}get textContent(){throw Error('body read');}get files(){throw Error('file read');}click(){assert.fail('native click');}}
 const form=new Node('FORM'),editor=new Node('TEXTAREA'),button=new Node('BUTTON');button.type='submit';button.form=form;editor.form=form;form.children=[editor,button];editor.parentElement=button.parentElement=form;const selected={'#form':[form],'#editor':[editor],'#send':[button]},profile={sendIntent:configured?{formSelector:'#form',editorSelector:'#editor',sendButtonSelector:'#send',...(enterSends==='absent'?{}:{enterSends})}:undefined};if(first){doc.location={origin:'http://127.0.0.1:1',href:'http://127.0.0.1:1/'};profile.firstSend={origin:doc.location.origin,operationAttribute:'data-operation',messageAttribute:'data-message'};form.attrs['data-operation']='op';form.attrs['data-message']='m';}if(rich){editor.tagName='DIV';editor.attrs.role='textbox';editor.attrs.contenteditable='true';editor.isContentEditable=true;profile.sendIntent.editorKinds=['contenteditable'];}const observer=createNativeSendIntentObserver({document:doc,profile,onFirstIntent:first?i=>firstIntents.push(i):null,onIntent:i=>intents.push(i),onPrepare:prepare?()=>preparations.push(true):null,now:()=>time,makeId:()=>`intent_${++id}`});function emit(type,patch={}){const e={type,isTrusted:true,target:type==='click'?button:editor,button:0,detail:1,key:'Enter',preventDefault:()=>assert.fail('preventDefault'),...patch};listeners.get(type)?.(e);}return {profile,observer,listeners,intents,preparations,firstIntents,doc,emit,form,editor,button,selected,Node,advance:ms=>time+=ms};}

function input(f,patch={}){const event={type:'input',isTrusted:true,target:f.editor,...patch};Object.defineProperty(event,'data',{get(){assert.fail('input data must not be read');}});f.listeners.get('input')?.(event);}
test('trusted input prepares an already focused editor without reading text or creating any send candidate',()=>{
 const f=fixture(true,true,true,true);input(f);input(f);assert.equal(f.preparations.length,2);assert.deepEqual(f.intents,[]);assert.deepEqual(f.firstIntents,[]);
 f.emit('click');assert.equal(f.intents[0].intentId,'intent_1','input must not consume a send identity');f.observer.stop();
});
test('input prepares disabled-send composer and plain rich-editor descendant',()=>{
 const f=fixture(true,true,true,false,true),span=new f.Node('SPAN');span.isContentEditable=true;span.parentElement=f.editor;f.editor.children=[span];f.button.disabled=true;
 input(f,{target:span});assert.equal(f.preparations.length,1);assert.deepEqual(f.intents,[]);f.observer.stop();
});
for(const mode of ['button','outside','nested-button','editing-island','synthetic','is-composing','tracked-composition','hidden','readonly','disabled-editor'])test('native input preparation rejects '+mode,()=>{
 const f=fixture(true,true,true,false,true);let patch={};
 if(mode==='button')patch.target=f.button;
 if(mode==='outside')patch.target=new f.Node('INPUT');
 if(mode==='nested-button'||mode==='editing-island'){const node=new f.Node(mode==='nested-button'?'BUTTON':'SPAN');node.parentElement=f.editor;node.isContentEditable=true;if(mode==='editing-island')node.attrs.contenteditable='true';f.editor.children=[node];patch.target=node;}
 if(mode==='synthetic')patch.isTrusted=false;
 if(mode==='is-composing')patch.isComposing=true;
 if(mode==='tracked-composition')f.emit('compositionstart');
 if(mode==='hidden')f.form.hidden=true;
 if(mode==='readonly')f.editor.readOnly=true;
 if(mode==='disabled-editor')f.editor.disabled=true;
 input(f,patch);assert.deepEqual(f.preparations,[]);assert.deepEqual(f.intents,[]);f.observer.stop();
});
test('composition ending allows later genuine input; retained input callback after stop is inert',()=>{
 const f=fixture(true,true,true);f.emit('compositionstart');input(f);assert.equal(f.preparations.length,0);f.emit('compositionend');input(f);assert.equal(f.preparations.length,1);
 const retained=f.listeners.get('input');assert.equal(typeof retained,'function');f.observer.stop();assert.equal(f.listeners.size,0);retained({type:'input',isTrusted:true,target:f.editor});assert.equal(f.preparations.length,1);assert.deepEqual(f.intents,[]);
});
