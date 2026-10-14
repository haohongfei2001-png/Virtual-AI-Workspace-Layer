import {createChatGPTAdapter} from '../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../src/host/surface-discovery.mjs';
import {createHostContentSession} from '../src/host/content-session.mjs';
import {HOST_CONFIG} from './config.mjs';
if(window===window.top&&location.origin===HOST_CONFIG.origin){
 const offlineSnippets=HOST_CONFIG.offlineSnippets===true&&location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const baseProfile=offlineSnippets?{...LEGACY_SURFACE_PROFILE,snippets:{enabled:true,rootSelector:'main > #reading',conversationIdAttribute:'data-conversation-id',messageSelector:'[data-message-id]',messageIdAttribute:'data-message-id',bodySelector:'.message-body',branchIdAttribute:'data-branch-id'}}:LEGACY_SURFACE_PROFILE;
 // This risk grammar is explicit only for the packaged loopback reconstruction.
 const offline=location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const profile=offline?{...baseProfile,inputRisk:{formSelector:'main > form#composer',editorSelector:'#prompt-textarea',filesSelector:'input[type="file"]',complete:{composer:true,attachment:true,upload:true,generation:true,voice:true,canvas:true},risks:Object.fromEntries(['upload','generation','voice','canvas'].map(kind=>[kind,{rootSelector:'main',activeSelector:'[data-native-'+kind+'="active"]'}]))}}:baseProfile;
 const session=createHostContentSession({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,adapterFactory:options=>createChatGPTAdapter({...options,profile})});
 void session.start();
}
