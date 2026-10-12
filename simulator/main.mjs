import { env } from './environment.mjs';
import { createHost } from './host.mjs';
import { createFixtureService } from './service.mjs';
import { startClient } from './client.mjs';
const host=createHost();globalThis.HF=host;
const mode=new URL(env.location.href).searchParams.get('mode')??'native';
let active=null,service=null;
if(mode==='page'){
  const id='hf_page_transport',doc=crypto.randomUUID(),getFrame=async()=>({documentId:doc,url:env.location.href,documentLifecycle:'active'});
  service=createFixtureService({indexedDB,extensionId:id,getFrame});
  const start=()=>{active?.stop();active=startClient({send:message=>service.broker.handle(message,{id,tab:{id:1},frameId:0,documentId:doc,documentLifecycle:'active',url:env.location.href}),
    subscribe:listener=>service.subscribe(listener),invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>host.state});return active;};
  start();globalThis.HFextension={start,stop:()=>active.stop(),refresh:()=>active.refresh(),showWorkspace:()=>active.showWorkspace(),status:()=>active.status(),command:c=>active.command(c),undo:()=>active.undo(),manage:()=>active.manage(),service};
  const original=host.control;globalThis.HF=Object.freeze({...host,control:(action,value)=>{original(action,value);if(['stress','timeZone','now'].includes(action))active.refresh();if(action==='read-delay')service.setDelay(value);}});
}
document.documentElement.dataset.hfTransport=mode==='page'?'PAGE_HARNESS_NOT_MV3':mode==='mv3'?'AWAITING_REAL_MV3':'NATIVE_ONLY';
