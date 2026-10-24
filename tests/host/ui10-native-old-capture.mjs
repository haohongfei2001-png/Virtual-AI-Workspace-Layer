import {assertUi10CaptureLayout,observeUi10OuterCapture,assertUi10OuterCapture} from './ui10-capture-preparation.mjs';
/** Reframe only the retained old-items-expanded picture; no item/expand mutations. */
export async function observeUi10OldStart(){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,w=root?.querySelector('.workspace'),toggle=root?.querySelector('.card .members > .old'),old=root?.querySelector('.card .old-list');
 if(!w||!old||toggle?.getAttribute('aria-expanded')!=='true')throw Error('expanded-old-capture-required');
 const ids=n=>[...n.querySelectorAll('.row')].map(r=>r.getAttribute('data-ref-id')),beforeIds=ids(old);if(beforeIds.length!==17||new Set(beforeIds).size!==17||beforeIds.some(id=>!id))throw Error('old-expanded-before-identities-required');
 const rect=n=>n.getBoundingClientRect().toJSON(),scroll=()=>({scrollTop:w.scrollTop,scrollLeft:w.scrollLeft,scrollHeight:w.scrollHeight,clientHeight:w.clientHeight,rect:rect(w)}),before=scroll(),initialToggle=rect(toggle);
 w.scrollTo({top:Math.max(0,w.scrollTop+initialToggle.top-before.rect.top-w.clientTop-8),left:w.scrollLeft,behavior:'instant'});
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const liveOld=root.querySelector('.card .old-list'),liveToggle=root.querySelector('.card .members > .old'),afterIds=liveOld?ids(liveOld):[];if(liveOld!==old||liveToggle!==toggle||JSON.stringify(beforeIds)!==JSON.stringify(afterIds))throw Error('old-expanded-identities-changed-during-capture');
 const first=old.querySelector('.row');if(!first)throw Error('old-first-row-required');const b=rect(w),targets=[toggle,first].map(n=>({present:true,visible:getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible',rect:rect(n)}));
 return {view:'old-items-expanded',preparation:'OLD_SECTION_START_FOR_CAPTURE_ONLY',scrollRestorationEvidence:false,before,after:scroll(),region:rect(old),oldRows:afterIds.length,beforeIds,afterIds,firstRowId:first.getAttribute('data-ref-id'),targets,clip:{left:Math.max(0,b.left+w.clientLeft),top:Math.max(0,b.top+w.clientTop),right:Math.min(innerWidth,b.left+w.clientLeft+w.clientWidth),bottom:Math.min(innerHeight,b.top+w.clientTop+w.clientHeight)}};
}
export async function prepareUi10OldStart(frame){const state=await frame.evaluate(observeUi10OldStart);let element;try{assertUi10CaptureLayout(state);if(state.oldRows!==17)throw Error('old-expanded-count-changed');element=await frame.frameElement();state.outer=await element.evaluate(observeUi10OuterCapture);state.pageTargets=assertUi10OuterCapture(state,state.outer);return state;}catch(error){error.ui10OldCaptureDiagnostics=state;throw error;}finally{await element?.dispose();}}
