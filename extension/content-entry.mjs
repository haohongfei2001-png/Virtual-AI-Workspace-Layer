import {loopbackProjectAssociationProfile} from '../src/host/loopback-project-association-profile.mjs';
import {installTemporaryNativeNavigation} from '../src/host/temporary-native-navigation.mjs';
import {installLocalStatus} from '../src/host/local-status.mjs';
import {selectHostSurfaceProfile} from '../src/host/chatgpt-observed-profile.mjs';
import {createIsolatedSessionReader} from '../src/host/isolated-session-reader.mjs';
import {createOldSendTerminalProfile} from '../src/host/old-send-terminal-profile.mjs';
import {createLoopbackFirstSendProfile} from '../src/host/first-send-profile.mjs';
import {createContextAssociationBridge} from '../src/host/context-association.mjs';
import {createChatGPTAdapter} from '../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../src/host/surface-discovery.mjs';
import {createHostContentSession} from '../src/host/content-session.mjs';
import {HOST_CONFIG} from './config.mjs';
if(window===window.top&&location.origin===HOST_CONFIG.origin&&HOST_CONFIG.temporaryReadOnly===true){
 const stop=installTemporaryNativeNavigation({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,profile:selectHostSurfaceProfile(HOST_CONFIG.surfaceProfile)});
 window.addEventListener('pagehide',event=>{if(!event.persisted)stop();});
}else if(window===window.top&&location.origin===HOST_CONFIG.origin){
 const offlineSnippets=HOST_CONFIG.offlineSnippets===true&&location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const configuredProfile=selectHostSurfaceProfile(HOST_CONFIG.surfaceProfile);
 const initialProfile=offlineSnippets?{...LEGACY_SURFACE_PROFILE,snippets:{enabled:true,rootSelector:'main > #reading',conversationIdAttribute:'data-conversation-id',messageSelector:'[data-message-id]',messageIdAttribute:'data-message-id',bodySelector:'.message-body',branchIdAttribute:'data-branch-id'}}:configuredProfile;
 const baseProfile=HOST_CONFIG.offlineFirstSend===true?{...initialProfile,firstSend:createLoopbackFirstSendProfile(HOST_CONFIG.origin)}:initialProfile;
 // This risk grammar is explicit only for the packaged loopback reconstruction.
 const offline=location.protocol==='http:'&&location.hostname==='127.0.0.1';
 const profile=offline&&HOST_CONFIG.offlineObservedProjectLayout!==true?{...baseProfile,...(HOST_CONFIG.offlineOldSendTerminal?{oldSendTerminal:createOldSendTerminalProfile(HOST_CONFIG.origin)}:{}),sendIntent:{...baseProfile.sendIntent,editorKinds:['textarea','contenteditable']},inputRisk:{formSelector:'main > form#composer',editorSelector:'#prompt-textarea',editorKinds:['textarea','contenteditable'],draftEditorsSelector:'main > form#composer textarea, main > form#composer [data-j3-editor="rich"]',filesSelector:'input[type="file"]',complete:{composer:true,attachment:true,upload:true,generation:true,voice:true,canvas:true},risks:Object.fromEntries(['upload','generation','voice','canvas'].map(kind=>[kind,{rootSelector:'main',activeSelector:'[data-native-'+kind+'="active"]'}]))}}:baseProfile;
 const session=createHostContentSession({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,identityReader:createIsolatedSessionReader({origin:HOST_CONFIG.origin,profile:HOST_CONFIG.sessionProfile??{}}),contextRecovery:HOST_CONFIG.scopeProfile.browserRequestContext===true,automaticDormancy:HOST_CONFIG.scopeProfile.singlePersonalDefault===true&&HOST_CONFIG.scopeProfile.browserRequestContext!==true,adapterFactory:options=>createChatGPTAdapter({...options,profile})});
 if(HOST_CONFIG.scopeProfile.browserRequestContext===true){
  const bridge=createContextAssociationBridge({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin,profile:HOST_CONFIG.offlineObservedProjectLayout===true?loopbackProjectAssociationProfile(profile,HOST_CONFIG,location.origin):HOST_CONFIG.scopeProfile.projectRequestContext==='loopback-project-v1'?{...profile,urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}:profile,isOwnedMask:session.isOwnedMask,onPending:session.contextPending,onReady:()=>{void session.contextReady();}});
  window.addEventListener('pagehide',event=>{if(!event.persisted)bridge.stop();});
 }
 const removeStatus=installLocalStatus({runtime:chrome.runtime,readState:session.localStatus});
 window.addEventListener('pagehide',event=>{if(!event.persisted)removeStatus();});
 void session.start();
}
