import {createHostContentSession} from '../src/host/content-session.mjs';
import {HOST_CONFIG} from './config.mjs';
if(window===window.top&&location.origin===HOST_CONFIG.origin){
 const session=createHostContentSession({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin});
 void session.start();
}
