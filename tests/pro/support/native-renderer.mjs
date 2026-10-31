import {createNavigation} from '../../../src/navigation/navigation.mjs';

/** Uses the existing Free renderer, never copies Project cards or Free rows.
 * A fixture navigation plan is consumed by the fixture six-port owner only.
 * Production supplies the existing Host-issued plans and dispatch authority.
 */
export function mountFixtureNativeView(container,controller,{projectsOnly=false,role='workspace',owner,onPresentationRequest=()=>{}}={}) {
 const doc=container.ownerDocument;let renderer=null,latest=null,disposed=false,scheduled=null,pendingPresentation=null;
 const adapter={currentURL:()=>controller.getStatus().launchContext?'https://fixture.test/c/'+controller.getStatus().launchContext.referenceId:'https://fixture.test/',status:()=>{},hasNativeLayer:()=>false,
  nativeHref:url=>typeof url==='string'&&url.startsWith('https://fixture.test/')?url:null,
  navigationPlan(ref){return {plan:{mode:'native-control',planRevision:1,target:{kind:'resolved',entity:'conversation',nativeId:ref.id,navigationURL:ref.nativeUrl}},targetKey:ref.id,uiGrantId:'isolated_fixture_grant',mountId:'isolated_fixture_mount'};},
  projectNavigationPlan:()=>null};
 function schedule(){if(disposed||scheduled!==null)return;scheduled=doc.defaultView.requestAnimationFrame(()=>{scheduled=null;if(!container.isConnected){schedule();return;}paint();});}
 function fit(){if(!projectsOnly||!container.isConnected)return;const shadow=container.firstElementChild?.shadowRoot;if(!shadow)return;
  if(!shadow.querySelector('[data-fixture-layout]')){const style=doc.createElement('style');style.setAttribute('data-fixture-layout','');style.textContent='.workspace{padding:0;overflow:visible;height:auto}.workspace-layout{display:block}.workspace-layout>.arrows,.workspace>.toolbar,.workspace-settings-layer,.free-list,.empty-inventory{display:none}.cards{padding-bottom:0;max-width:1200px}.workspace-core{padding:0}';shadow.append(style);}
  const height=shadow.querySelector('.workspace-core')?.scrollHeight??180;container.style.cssText='height:'+Math.max(130,height+4)+'px;min-height:0;max-height:none;width:100%';
 }
 function paint(){
  if(!renderer)renderer=createNavigation({document:doc,adapter,surface:{root:container,role},onPresentationRequest,
   onFrameRendered:()=>doc.defaultView.requestAnimationFrame(fit),
   onProjectionRequest:query=>owner.fixtureNativeProjection({...query,role}),
   onDispatch:async action=>{const r=controller.getSnapshot().references.find(r=>r.id===action.targetKey);if(!r)return {state:'blocked'};await controller.open(r.id,{origin:r.membership.state==='PROJECT'?'native-project':'direct',nativeProjectId:r.membership.projectId??null});return {state:'dispatched'};}});
  if(latest){const dto=structuredClone(latest);dto.role=role;if(projectsOnly)for(const key of ['noProject','unknown'])dto.entries[key]={items:[],total:0,offset:0,limit:5,hasMore:false,inventoryTotal:0};renderer.updateFrameProjection(dto);fit();}if(pendingPresentation){const intent=pendingPresentation;pendingPresentation=null;renderer.present(intent);}
 }
 return {update(dto){latest=dto;schedule();},present(intent){pendingPresentation=intent;schedule();},stop(){disposed=true;if(scheduled!==null)doc.defaultView.cancelAnimationFrame(scheduled);renderer?.stop();container.replaceChildren();}};
}
