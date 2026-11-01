import {createFreeFrameClient} from '../src/host/free-frame-client.mjs';
import {HOST_CONFIG} from './config.mjs';
import {runtimeBuildMatches} from './runtime-build.mjs';
if(HOST_CONFIG.browserLocal&&!runtimeBuildMatches(chrome.runtime))throw Error('runtime-build-mismatch');
window.parent.postMessage({type:'VAIWL_UI_BOOT',role:'sidebar',stage:'module-ready'},HOST_CONFIG.origin);
const client=createFreeFrameClient({document,runtime:chrome.runtime,role:'sidebar',parentOrigin:HOST_CONFIG.origin,privateRoot:document.querySelector('main')});
void client.start();
