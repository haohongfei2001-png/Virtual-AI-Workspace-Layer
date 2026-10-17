import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSendIntentObserver} from '../../src/host/native-send-intent.mjs';

// Passive trusted-event doubles; no physical input or real ChatGPT data.
function fixture({retireAt=null,oldRoute=false,restart=false,throwAfterRetire=false}={}){
 const listeners=new Map(),first=[],intents=[],prepared=[];let observer,replacement,retired=false,ids=0;
 const retire=window=>{if(window!==retireAt||retired)return;retired=true;observer.stop();if(restart)replacement=create('new');if(throwAfterRetire)throw Error('retired callback failed');};
 let selected;
 const doc={location:{origin:'https://chatgpt.com',href:oldRoute?'https://chatgpt.com/c/C':'https://chatgpt.com/',pathname:oldRoute?'/c/C':'/'},defaultView:{getComputedStyle(node){retire('computed-style');return node.style;}},querySelectorAll(selector){retire('boundary-query');return selected[selector];},addEventListener(type,callback){listeners.set(type,callback);},removeEventListener(type,callback){if(listeners.get(type)===callback)listeners.delete(type);}};
 const node=tag=>({tagName:tag,ownerDocument:doc,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},children:[],getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false,contains(other){return this.children.includes(other);}});
 const form=node('FORM'),editor=node('TEXTAREA'),button=node('BUTTON');button.type='submit';button.form=editor.form=form;editor.parentElement=button.parentElement=form;form.children=[editor,button];selected={'#form':[form],'#editor':[editor],'#send':[button]};
 form.getAttribute=key=>{if(key==='data-operation'){retire('operation-attribute');return 'operation';}if(key==='data-message'){retire('message-attribute');return 'message';}return null;};
 const profile={sendIntent:{formSelector:'#form',editorSelector:'#editor',sendButtonSelector:'#send',enterSends:true},firstSend:{origin:'https://chatgpt.com',operationAttribute:'data-operation',messageAttribute:'data-message'},oldSendTerminal:{origin:'https://chatgpt.com',operationAttribute:'data-operation',messageAttribute:'data-message'}};
 function create(generation){return createNativeSendIntentObserver({document:doc,profile,now:()=>{retire('clock');return 1000;},makeId:()=>{retire('make-id');return 'intent_'+(++ids);},onPrepare:()=>{prepared.push(generation);retire('prepare');},onFirstIntent:intent=>{first.push({generation,intent});retire('first-consumer');},onIntent:intent=>intents.push({generation,intent})});}
 observer=create('old');const event=(type='click')=>({type,isTrusted:true,target:type==='click'?button:editor,button:0,detail:1,key:'Enter'});
 return {listeners,first,intents,prepared,observer,event,emit(type='click'){listeners.get(type)?.(event(type));},get retired(){return retired;},stop(){observer.stop();replacement?.stop();}};
}

for(const window of ['boundary-query','computed-style','clock','make-id','operation-attribute','message-attribute'])test('retirement during '+window+' suppresses both downstream consumers',t=>{
 const f=fixture({retireAt:window});t.after(()=>f.stop());f.emit();assert.equal(f.retired,true);assert.deepEqual(f.first,[]);assert.deepEqual(f.intents,[]);assert.equal(f.listeners.size,0);
});
for(const window of ['operation-attribute','message-attribute'])test('old-conversation '+window+' retirement suppresses downstream intent',t=>{
 const f=fixture({retireAt:window,oldRoute:true});t.after(()=>f.stop());f.emit();assert.equal(f.retired,true);assert.deepEqual(f.first,[]);assert.deepEqual(f.intents,[]);assert.equal(f.listeners.size,0);
});
for(const throwAfterRetire of [false,true])test('first-send consumer retirement'+(throwAfterRetire?' followed by throw':'')+' cannot deliver general intent',t=>{
 const f=fixture({retireAt:'first-consumer',throwAfterRetire});t.after(()=>f.stop());f.emit();assert.equal(f.first.length,1);assert.equal(f.first[0].generation,'old');assert.deepEqual(f.intents,[]);assert.equal(f.listeners.size,0);
});
test('first-send callback can replace observer but the current gesture cannot leak into either general consumer',t=>{
 const f=fixture({retireAt:'first-consumer',restart:true});t.after(()=>f.stop());const retained=f.listeners.get('click');f.emit();assert.equal(f.first.length,1);assert.deepEqual(f.intents,[]);assert.deepEqual([...f.listeners.keys()].sort(),['click','keydown','compositionstart','compositionend','focusin','pointerdown','input'].sort());
 retained(f.event());assert.equal(f.first.length,1);assert.deepEqual(f.intents,[]);
 f.emit();assert.deepEqual(f.first.map(item=>item.generation),['old','new']);assert.deepEqual(f.intents.map(item=>item.generation),['new']);
});
test('preparation retirement leaves retained callbacks inert while unrelated new observer remains usable',t=>{
 const f=fixture({retireAt:'prepare',restart:true});t.after(()=>f.stop());const retained=f.listeners.get('click');f.emit('focusin');assert.deepEqual(f.prepared,['old']);assert.deepEqual(f.intents,[]);
 retained(f.event());assert.deepEqual(f.intents,[]);f.emit();assert.deepEqual(f.intents.map(item=>item.generation),['new']);
});
test('ordinary live observer still reports first and general candidates once per trusted gesture',t=>{
 const f=fixture();t.after(()=>f.stop());f.emit();assert.equal(f.first.length,1);assert.equal(f.intents.length,1);assert.equal(f.first[0].intent.intentId,f.intents[0].intent.intentId);assert.equal(f.retired,false);
});
