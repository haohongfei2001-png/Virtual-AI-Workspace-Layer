import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextAssociationBridge} from '../../src/host/context-association.mjs';
const origin='http://127.0.0.1:8123',P='g-p-'+'1'.repeat(32);
function setup(){
 let at=1000,id=P,hidden=false;const listeners=new Set(),doc={location:{href:origin+'/g/'+P+'/project'}};
 doc.defaultView={getComputedStyle:()=>({display:'block',visibility:'visible'})};
 const root={isConnected:true,ownerDocument:doc,parentElement:null,get hidden(){return hidden;},getClientRects:()=>[{}],getAttribute:k=>k==='data-project-id'?id:null,get textContent(){throw Error('no text');}};
 doc.querySelectorAll=selector=>selector==='#members'?[root]:[];
 const profile={id:'offline',revision:1,regions:{members:'#members'},memberProjectIdAttribute:'data-project-id',urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}};
 const runtime={id:'ext',onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}};
 const bridge=createContextAssociationBridge({document:doc,runtime,origin,profile,now:()=>at,elapsedNow:()=>at});
 const message={type:'HOST_CONTEXT_ASSOCIATE',challenge:'challenge',actualURL:doc.location.href,projectId:P,expiresAt:new Date(7000).toISOString()};
 return {bridge,message,call(m=message,sender={id:'ext'}){const replies=[];for(const listener of listeners)listener(m,sender,r=>replies.push(r));return replies;},hide(){hidden=true;},expire(){at=7000;},move(){id='g-p-'+'2'.repeat(32);}};
}
test('private Project challenge returns only matching typed association',()=>{const f=setup();assert.deepEqual(f.call(),[{challenge:'challenge',actualURL:f.message.actualURL,projectId:P,association:'explicit-project-id'}]);f.bridge.stop();assert.deepEqual(f.call(),[]);});
for(const kind of ['conversation','both','extra','foreign','page','hidden','expired','stale','route'])test('Project bridge rejects '+kind,()=>{const f=setup();let m=f.message,sender={id:'ext'};if(kind==='conversation'){m={...m,conversationId:P};delete m.projectId;}if(kind==='both')m={...m,conversationId:P};if(kind==='extra')m={...m,contextId:'team'};if(kind==='foreign')sender.id='foreign';if(kind==='page')sender.tab={id:1};if(kind==='hidden')f.hide();if(kind==='expired')f.expire();if(kind==='stale')f.move();if(kind==='route')m={...m,actualURL:origin+'/'};assert(!f.call(m,sender).some(x=>x?.association==='explicit-project-id'));f.bridge.stop();});
