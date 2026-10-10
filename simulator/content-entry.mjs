import { env } from './environment.mjs';
import { startClient } from './client.mjs';
import { syntheticURL } from './data.mjs';
if(syntheticURL(env.location.href)&&new URL(env.location.href).searchParams.get('mode')==='mv3'){
  let active=null;
  const start=()=>startClient({send:m=>chrome.runtime.sendMessage(m),subscribe:callback=>{
    const fn=m=>{if(m?.type==='HF_DOCUMENT_INVALIDATED')callback();};chrome.runtime.onMessage.addListener(fn);return()=>chrome.runtime.onMessage.removeListener(fn);
  }});
  active=start();chrome.runtime.onMessage.addListener(m=>{if(m?.type==='HF_TOGGLE'){if(active){active.stop();active=null;}else active=start();}});
  // Test-only DOM event bridge; always obtains evidence from the real MV3 worker.
  document.addEventListener('hf:test-worker-probe',async()=>{
    let result;
    try{result=await chrome.runtime.sendMessage({type:'HF_TEST_WORKER_PROBE'});}
    catch{result={ok:false};}
    document.documentElement.dataset.hfWorkerProbe=JSON.stringify(result);
  });
}
