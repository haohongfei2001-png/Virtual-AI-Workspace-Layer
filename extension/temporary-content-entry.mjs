import {installTemporaryNativeNavigation} from '../src/host/temporary-native-navigation.mjs';
import {selectHostSurfaceProfile} from '../src/host/chatgpt-observed-profile.mjs';
import {HOST_CONFIG} from './config.mjs';

// Bundled as a classic content script: registration completes in the injection
// task, without loading the authenticated Host runtime or waiting for imports.
if(window===window.top&&location.origin===HOST_CONFIG.origin&&HOST_CONFIG.temporaryReadOnly===true){
 const stop=installTemporaryNativeNavigation({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,profile:selectHostSurfaceProfile(HOST_CONFIG.surfaceProfile)});
 window.addEventListener('pagehide',event=>{if(!event.persisted)stop();});
}
