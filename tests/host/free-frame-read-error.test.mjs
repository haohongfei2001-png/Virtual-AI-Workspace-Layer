import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameReadError} from '../../src/host/free-frame-read-error.mjs';
function fixture(callbacks={}){
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.style={};this.handlers=new Map();this.disabled=false;}
  setAttribute(key,value){this.attrs[key]=value;}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}
  addEventListener(name,fn){this.handlers.set(name,fn);}
  click(trusted=true){this.handlers.get('click')?.({isTrusted:trusted});}
  set innerHTML(_){throw Error('HTML assignment forbidden');}
 }
 const document={createElement:tag=>new Node(tag)},container=new Node('div'),unrelated=new Node('aside');container.append(unrelated);let retries=0,exits=0;
 const ui=createFreeFrameReadError({document,container,onRetry:()=>{retries++;return callbacks.onRetry?.();},onExit:()=>{exits++;return callbacks.onExit?.();}});
 return {ui,container,unrelated,get retries(){return retries;},get exits(){return exits;},get root(){return container.children.find(node=>Object.hasOwn(node.attrs,'data-vaiwl-read-error'));},buttons(){return this.root.children.filter(node=>node.tagName==='button');}};
}
test('terminal status and two accessible native buttons render without initiating recovery',()=>{const f=fixture();f.ui.show();assert.equal(f.retries,0);assert.equal(f.exits,0);const status=f.root.children[0];assert.equal(status.textContent,'工作空间数据正在更新，本次读取已停止。');assert.equal(status.attrs.role,'status');assert.equal(status.attrs['aria-live'],'polite');assert.deepEqual(f.buttons().map(node=>[node.textContent,node.type,node.disabled]),[['重新读取','button',false],['返回原生界面','button',false]]);});
test('retry synchronously disables before callback and accepts at most one activation',()=>{let retry;const f=fixture({onRetry:()=>{assert.equal(retry.disabled,true);retry.click();}});f.ui.show();[retry]=f.buttons();retry.click();retry.click();assert.equal(f.retries,1);assert.equal(f.exits,0);});
test('nonretryable terminal remains readable and allows native exit',()=>{const f=fixture();f.ui.show({retryable:false});const [retry,exit]=f.buttons();assert(retry.disabled);retry.click();assert.equal(f.retries,0);exit.click();assert.equal(f.exits,1);assert(exit.disabled);});
test('untrusted programmatic clicks never trigger either callback',()=>{const f=fixture();f.ui.show();for(const button of f.buttons())button.click(false);assert.equal(f.retries,0);assert.equal(f.exits,0);});
test('exit is once-only and cancels further retry on this terminal',()=>{const f=fixture();f.ui.show();const [retry,exit]=f.buttons();exit.click();exit.click();retry.click();assert.equal(f.exits,1);assert.equal(f.retries,0);assert(retry.disabled);});
test('new terminal replaces only owned nodes and invalidates all old handlers',()=>{const f=fixture();f.ui.show();const old=f.buttons();old[0].click();f.ui.show();assert.equal(f.container.children.length,2);assert.equal(f.container.children[0],f.unrelated);old[0].click();old[1].click();assert.equal(f.retries,1);assert.equal(f.exits,0);const [retry]=f.buttons();assert.equal(retry.disabled,false);retry.click();assert.equal(f.retries,2);});
test('stop clears owned DOM, revokes old handlers and permanently prevents show',()=>{const f=fixture();f.ui.show();const old=f.buttons();f.ui.stop();for(const button of old)button.click();f.ui.show();f.ui.stop();assert.deepEqual(f.container.children,[f.unrelated]);assert.equal(f.retries,0);assert.equal(f.exits,0);});
for(const failure of ['throw','reject'])test('callback '+failure+' cannot automatically reenable retry or trigger another read',async()=>{const f=fixture({onRetry:()=>{if(failure==='throw')throw Error('failed');return Promise.reject(Error('failed'));}});f.ui.show();const [retry]=f.buttons();assert.doesNotThrow(()=>retry.click());await Promise.resolve();retry.click();assert.equal(f.retries,1);assert(retry.disabled);});
test('callback can synchronously show a new terminal without stale mutation',()=>{let f;f=fixture({onRetry:()=>f.ui.show()});f.ui.show();const [old]=f.buttons();old.click();const [fresh]=f.buttons();assert.notEqual(old,fresh);assert.equal(fresh.disabled,false);old.click();assert.equal(f.retries,1);});
test('invalid configuration is rejected before DOM writes',()=>{assert.throws(()=>createFreeFrameReadError({}),/invalid-free-frame-read-error/);const f=fixture();assert.throws(()=>f.ui.show({retryable:'yes'}),/invalid-free-frame-read-error-retryable/);assert.deepEqual(f.container.children,[f.unrelated]);});
