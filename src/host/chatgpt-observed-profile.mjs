import {CHATGPT_SELECTION_CURRENT_BODY} from './current-body-discovery.mjs';
import {LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
// The observed Chinese desktop surface is a candidate, not an authority profile.
// Unsupported membership/send/risk grammars stay absent; no synthetic NONE/ACK.
export const CHATGPT_OBSERVED_PROFILE=Object.freeze({
 id:'chatgpt-zh-desktop-observed-20261018',revision:1,reconstruction:false,liveVerified:false,
 regions:Object.freeze({projects:'nav:not([data-app-navigation-rail])',history:'nav:not([data-app-navigation-rail])',members:':not(*)',moveMenu:':not(*)'}),
 controls:'a[href]',conversationControls:'a[href]',maxCandidates:256,
 currentBody:CHATGPT_SELECTION_CURRENT_BODY,
 nativeLayout:Object.freeze({
  header:'[data-app-shell-titlebar]',navigationSlot:'[data-app-shell-main-titlebar]',
  readingViewport:'[data-app-action-timeline-scroll]',
  reading:'[data-app-action-timeline-scroll] > :not([data-thread-scroll-footer])',
  composer:'[data-app-action-timeline-scroll] > [data-thread-scroll-footer]',
  historyList:'nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])',
  returnPlacement:'header-gap',returnHitRoot:'[data-app-shell-main-content-layout]',
 }),
});
export function selectHostSurfaceProfile(id){
 if(id===undefined)return LEGACY_SURFACE_PROFILE;
 if(id===CHATGPT_OBSERVED_PROFILE.id)return CHATGPT_OBSERVED_PROFILE;
 throw Error('unsupported-host-surface-profile');
}
