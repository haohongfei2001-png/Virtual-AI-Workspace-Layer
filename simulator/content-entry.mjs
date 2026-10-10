import { env } from './environment.mjs';
import { startClient } from './client.mjs';
import { syntheticURL } from './data.mjs';
if(syntheticURL(env.location.href)&&new URL(env.location.href).searchParams.get('mode')==='mv3'){
  let active=null;
  const start=()=>startClient({send:m=>chrome.runtime.sendMessage(m),subscribe:callback=>{
    const fn=m=>{if(m?.type==='HF_DOCUMENT_INVALIDATED')callback();};chrome.runtime.onMessage.addListener(fn);return()=>chrome.runtime.onMessage.removeListener(fn);
  }});
  active=start();chrome.runtime.onMessage.addListener(m=>{if(m?.type==='HF_TOGGLE'){if(active){active.stop();active=null;}else active=start();}});
}
