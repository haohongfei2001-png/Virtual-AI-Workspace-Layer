import {createUnifiedFrameClient} from '../src/host/pro-frame-client.mjs';
import {HOST_CONFIG} from './config.mjs';
window.parent.postMessage({type:'VAIWL_UI_BOOT',role:'sidebar',stage:'module-ready'},HOST_CONFIG.origin);
const client=createUnifiedFrameClient({document,runtime:chrome.runtime,role:'sidebar',parentOrigin:HOST_CONFIG.origin,privateRoot:document.querySelector('main')});
void client.start();
