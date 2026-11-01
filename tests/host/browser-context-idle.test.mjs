import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,deferred,flush} from '../runtime/context-recovery/fixture.mjs';

test('C2 lookup rejection cannot hide its still-pending sibling browser operation',async t=>{
 const h=createFixture(t),held=deferred();
 h.frameReader=()=>held.promise;h.tabReader=()=>Promise.reject(Error('tab-lookup-failed'));
 const request=await h.send();await h.complete(request);
 assert.equal(h.observer.isIdle(),false);
 held.resolve(h.browserFrame());await flush();
 assert.equal(h.observer.isIdle(),true);assert.equal(await h.verify(),null);
 assert.equal(h.identity.calls,0);
});

test('C2 aborted association stays nonidle through late rejection without further browser calls',async t=>{
 const h=createFixture(t);await h.native();const held=deferred(),abort=new AbortController();let frameCalls=0;
 h.associationReader=()=>held.promise;h.frameReader=query=>{frameCalls++;return h.browserFrame(query.tabId);};
 const pending=h.observer.verify(h.frame(),{signal:abort.signal});await flush();abort.abort();
 assert.equal(await pending,null);assert.equal(h.observer.isIdle(),false);
 held.reject(Error('late-association-failure'));await flush();
 assert.equal(h.observer.isIdle(),true);assert.equal(frameCalls,0);assert.equal(h.identity.calls,0);
 h.stop();assert.equal(h.observer.isIdle(),false,'stopped is not an idle live owner');
});
