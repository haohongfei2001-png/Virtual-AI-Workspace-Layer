import {createOldSendTerminalProfile} from '../src/host/old-send-terminal-profile.mjs';
import {createLoopbackFirstSendProfile} from '../src/host/first-send-profile.mjs';
import {createContextAssociationBridge} from '../src/host/context-association.mjs';
import {createChatGPTAdapter} from '../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../src/host/surface-discovery.mjs';
import {createHostContentSession} from '../src/host/content-session.mjs';
import {HOST_CONFIG} from './config.mjs';
if(window===window.top&&location.origin===HOST_CONFIG.origin){
 const offlineSnippets=HOST_CONFIG.offlineSnippets===true&&location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const initialProfile=offlineSnippets?{...LEGACY_SURFACE_PROFILE,snippets:{enabled:true,rootSelector:'main > #reading',conversationIdAttribute:'data-conversation-id',messageSelector:'[data-message-id]',messageIdAttribute:'data-message-id',bodySelector:'.message-body',branchIdAttribute:'data-branch-id'}}:LEGACY_SURFACE_PROFILE;
 const baseProfile=HOST_CONFIG.offlineFirstSend===true?{...initialProfile,firstSend:createLoopbackFirstSendProfile(HOST_CONFIG.origin)}:initialProfile;
 // This risk grammar is explicit only for the packaged loopback reconstruction.
 const offline=location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const profile=offline?{...baseProfile,...(HOST_CONFIG.offlineOldSendTerminal?{oldSendTerminal:createOldSendTerminalProfile(HOST_CONFIG.origin)}:{}),sendIntent:{...baseProfile.sendIntent,editorKinds:['textarea','contenteditable']},inputRisk:{formSelector:'main > form#composer',editorSelector:'#prompt-textarea',editorKinds:['textarea','contenteditable'],draftEditorsSelector:'main > form#composer textarea, main > form#composer [data-j3-editor="rich"]',filesSelector:'input[type="file"]',complete:{composer:true,attachment:true,upload:true,generation:true,voice:true,canvas:true},risks:Object.fromEntries(['upload','generation','voice','canvas'].map(kind=>[kind,{rootSelector:'main',activeSelector:'[data-native-'+kind+'="active"]'}]))}}:baseProfile;
 const session=createHostContentSession({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,contextRecovery:HOST_CONFIG.scopeProfile.browserRequestContext===true,adapterFactory:options=>createChatGPTAdapter({...options,profile})});
 if(HOST_CONFIG.scopeProfile.browserRequestContext===true){
  const bridge=createContextAssociationBridge({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,profile,isOwnedMask:session.isOwnedMask,onPending:session.contextPending,onReady:()=>{void session.contextReady();}});
  window.addEventListener('pagehide',event=>{if(!event.persisted)bridge.stop();});
 }
 void session.start();
}
