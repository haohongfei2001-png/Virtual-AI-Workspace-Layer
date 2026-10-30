import test from 'node:test';
import assert from 'node:assert/strict';
import {installLocalReconnect,requestLocalReconnect} from '../../src/host/local-reconnect.mjs';
const target={tabId:7,documentId:'doc',url:'https://chatgpt.com/'};
test('only exact private popup requests reach reconnect, with URL preserved',()=>{
 let listener,called=0,url;const runtime={id:'ext',getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener:f=>listener=f,removeListener:f=>{assert.equal(f,listener);}}};
 const remove=installLocalReconnect({runtime,reconnect:u=>{called++;url=u;return true;}}),message={v:1,type:'HOST_LOCAL_RECONNECT',url:target.url},sender={id:'ext',url:runtime.getURL('status.html')},replies=[];
 for(const bad of [{...sender,tab:{id:7}},{...sender,id:'other'},{...sender,url:'https://chatgpt.com/'},{}])listener(message,bad,r=>replies.push(r));
 listener({...message,extra:1},sender,r=>replies.push(r));assert.equal(called,0);assert.equal(replies.length,0);
 listener(message,sender,r=>replies.push(r));assert.equal(called,1);assert.equal(url,target.url);assert.deepEqual(replies,[{v:1,ok:true}]);remove();
});
for(const mode of ['ok','other-tab','switch-during-check','new-document','new-route','inactive','refused','extra-reply'])test('explicit reconnect snapshot fencing: '+mode,async()=>{
 const sent=[];let queries=0;const tabs={query:async()=>[{id:mode==='other-tab'||mode==='switch-during-check'&&++queries>1?8:7,incognito:false}],sendMessage:async(...args)=>{sent.push(args);return mode==='extra-reply'?{v:1,ok:true,secret:'not-trusted'}:{v:1,ok:mode!=='refused'};}};
 const webNavigation={getFrame:async()=>({documentId:mode==='new-document'?'new':'doc',url:mode==='new-route'?target.url+'c/other':target.url,documentLifecycle:mode==='inactive'?'cached':'active'})};
 assert.equal(await requestLocalReconnect({tabs,webNavigation,target}),mode==='ok');assert.equal(sent.length,['ok','refused','extra-reply'].includes(mode)?1:0);
 if(sent.length)assert.deepEqual(sent[0],[7,{v:1,type:'HOST_LOCAL_RECONNECT',url:target.url},{documentId:'doc'}]);
});

test('timed-out frame inspection cannot dispatch late or retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let finish,sends=0;
 const tabs={query:async()=>[{id:7}],sendMessage:async()=>{sends++;return {v:1,ok:true};}};
 const pending=requestLocalReconnect({tabs,webNavigation:{getFrame:()=>new Promise(r=>finish=r)},target});
 await Promise.resolve();t.mock.timers.tick(1000);assert.equal(await pending,false);
 finish({documentId:'doc',url:target.url,documentLifecycle:'active'});await Promise.resolve();await Promise.resolve();assert.equal(sends,0);
});
