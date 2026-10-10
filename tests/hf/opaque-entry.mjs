import { createHost } from '../../simulator/host.mjs';
import { createDocumentBindingBroker } from '../../src/b1/document-binding-broker.mjs';
import { dataset, routeInfo, scopeOf, syntheticURL } from '../../simulator/data.mjs';
import { startClient } from '../../simulator/client.mjs';
import { env } from '../../simulator/environment.mjs';
/** READ-ONLY test double, NOT ScopeRepository and NEVER a storage fallback in the app. */
const fixtureRecords=scope=>dataset(scope.accountId,env.location.origin,120).refs.map(r=>({conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId,revision:1}));
const host=createHost();let readDelay=0,transportFailed=false,active=null,leaseCounter=0;
const broker=createDocumentBindingBroker({extensionId:'opaque_test',allowedURL:syntheticURL,makeId:()=> 'opaque-lease-'+(++leaseCounter),
  getFrame:async()=>({documentId:'opaque-document',url:env.location.href,documentLifecycle:'active'}),
  resolveScope:async()=>scopeOf(routeInfo(env.location.href)?.account),
  repository:{get:async(s,id)=>fixtureRecords(s).find(r=>r.conversationId===id)??null,
    list:async s=>{if(readDelay)await new Promise(r=>setTimeout(r,readDelay));return fixtureRecords(s);},
    upsert:async()=>{throw Error('read-only-test-double-not-storage');}}
});
const start=()=>{active?.stop();transportFailed=false;active=startClient({
  send:m=>{if(transportFailed)return Promise.reject(Error('injected-transport-failure'));return broker.handle(m,{id:'opaque_test',tab:{id:1},frameId:0,documentId:'opaque-document',documentLifecycle:'active',url:env.location.href});},
  invalidateRemote:()=>broker.invalidate({tabId:1}),readControls:()=>host.state});return active;};
globalThis.HF=Object.freeze({...host,control:(a,v)=>{host.control(a,v);if(a==='read-delay')readDelay=Number(v);}});
globalThis.HFextension={start,stop:()=>active?.stop(),refresh:()=>active?.refresh(),showWorkspace:()=>active?.showWorkspace(),status:()=>active?.status(),
  view:()=>active?.navigation.view(),failTransport:()=>{transportFailed=true;active?.refresh();}};
document.documentElement.dataset.hfTransport='OPAQUE_DOM_TEST_FAKE_ROUTER_FAKE_SENDER_NO_STORAGE';
if(new URL(env.location.href).searchParams.get('mode')==='page')start();
