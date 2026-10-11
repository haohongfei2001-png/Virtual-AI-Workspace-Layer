import { createHost } from '../../simulator/host.mjs';
import { createFixtureService } from '../../simulator/service.mjs';
import { startClient } from '../../simulator/client.mjs';
import { MockIDBFactory } from './mock-idb.mjs';
import { env } from '../../simulator/environment.mjs';
/** DOM validation only: fake browser authority and in-memory IDB emulator are explicit.
 * The app's production files do NOT import this module or this mock.
 */
const host=createHost(),factory=new MockIDBFactory();let active=null,transportFailed=false,service,leaseSeq=0;
function makeService(){service=createFixtureService({indexedDB:factory,extensionId:'b23_opaque_test',makeId:()=> 'opaque_lease_'+(++leaseSeq),getFrame:async()=>({documentId:'opaque_document',url:env.location.href,documentLifecycle:'active'})});}
makeService();
const start=()=>{active?.stop();transportFailed=false;active=startClient({
  send:m=>{if(transportFailed)return Promise.reject(Error('injected-transport-failure'));return service.broker.handle(m,{id:'b23_opaque_test',tab:{id:1},frameId:0,documentId:'opaque_document',documentLifecycle:'active',url:env.location.href});},
  invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>host.state});return active;};
globalThis.HF=Object.freeze({...host,control:(a,v)=>{host.control(a,v);if(a==='read-delay')service.setDelay(v);}});
globalThis.HFextension={start,stop:()=>active?.stop(),refresh:()=>active?.refresh(),showWorkspace:()=>active?.showWorkspace(),status:()=>active?.status(),
  view:()=>active?.navigation.view(),command:c=>active.command(c),undo:()=>active.undo(),manage:()=>active.manage(),
  restartService:()=>{active?.stop();service.close();makeService();start();},getService:()=>service,
  failTransport:()=>{transportFailed=true;active?.refresh();}};
document.documentElement.dataset.hfTransport='OPAQUE_DOM_FAKE_ROUTER_FAKE_SENDER_MOCK_IDB_NOT_DURABLE';
if(new URL(env.location.href).searchParams.get('mode')==='page')start();
