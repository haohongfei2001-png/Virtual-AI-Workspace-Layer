import {createFreeFrameClient} from '../src/host/free-frame-client.mjs';
import {HOST_CONFIG} from './config.mjs';
window.parent.postMessage({type:'VAIWL_UI_BOOT',role:'workspace',stage:'module-ready'},HOST_CONFIG.origin);
const client=createFreeFrameClient({document,runtime:chrome.runtime,role:'workspace',parentOrigin:HOST_CONFIG.origin,privateRoot:document.querySelector('main')});
void client.start();
