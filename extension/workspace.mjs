import {createFreeFrameClient} from '../src/host/free-frame-client.mjs';
import {HOST_CONFIG} from './config.mjs';
const client=createFreeFrameClient({document,runtime:chrome.runtime,role:'workspace',parentOrigin:HOST_CONFIG.origin,privateRoot:document.querySelector('main')});
void client.start();
