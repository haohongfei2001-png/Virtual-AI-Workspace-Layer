import assert from 'node:assert/strict';

export const UI10_PREFLIGHT_VIEWPORTS=Object.freeze([
 {width:1440,height:1000},{width:1440,height:520},
 {width:420,height:1000},{width:420,height:520},
]);

/** Read-only when focus=false, so active-surface hit testing cannot be
 * accidentally performed only after the first native focus has surrendered it. */
export function observeUi10NativeControls(focus=false){
 const controls=['#prompt-textarea','#model-button','#tools-button','#composer input[type=file]','#composer button[type=submit]'].map(selector=>{
  const n=document.querySelector(selector),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  if(focus)n.focus({preventScroll:true});
  return {id:selector,rect:r.toJSON(),hit:hit===n||n.contains(hit),focused:focus?document.activeElement===n:null};
 });
 return {viewport:{width:innerWidth,height:innerHeight},ownedSurfaces:document.querySelectorAll('[data-va-owned]').length,controls,headers:[...document.querySelectorAll('main > header')].map(n=>n.getBoundingClientRect().toJSON()),scroll:{x:scrollX,y:scrollY,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}};
}
export function assertUi10NativeControls(sample,{requireFocus=false}={}){
 assert.equal(sample.controls.length,5,'complete native input/model/tools/attachment/send baseline');
 for(const control of sample.controls){
  const {rect:r}=control;
  assert(r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=sample.viewport.width&&r.bottom<=sample.viewport.height,JSON.stringify({reason:'native-control-outside-viewport',control,viewport:sample.viewport}));
  assert.equal(control.hit,true,control.id+': native control must be hit-testable');
  if(requireFocus)assert.equal(control.focused,true,control.id+': native control must accept focus');
 }
 return sample;
}
export function assertUi10NativePreflight(sample){
 assert.equal(sample.ownedSurfaces,0,'native baseline must precede extension loading');
 return assertUi10NativeControls(sample,{requireFocus:true});
}

/** Native application gate before Extensions.loadUnpacked and before any
 * expensive observation/IDB journey. Only this separate empty fixture page is
 * used; native source/controls are never rewritten by the probe. */
export async function runUi10NativePreflight({context,url}){
 const page=await context.newPage(),results=[];
 try{
  await page.goto(url);await page.locator('#prompt-textarea').waitFor();
  for(const viewport of UI10_PREFLIGHT_VIEWPORTS){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const sample=await page.evaluate(observeUi10NativeControls,true);
   results.push(assertUi10NativePreflight(sample));
   await page.locator('#model-button').click();await page.locator('#native-dialog[open]').waitFor();await page.locator('#native-dialog button').click();
   await page.locator('#prompt-textarea').click();assert.equal(await page.locator('#prompt-textarea').evaluate(n=>n===document.activeElement),true);
   if(viewport.width===420){
    await page.locator('#sidebar-toggle').click();await page.locator('#sidebar-close').waitFor({state:'visible'});
    assert.equal(await page.locator('aside nav[aria-label="Chat history"]').isVisible(),true);
    await page.locator('#sidebar-close').click();assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
   }
  }
  return {status:'PASS_NATIVE_FIXTURE_BEFORE_EXTENSION',results};
 }catch(error){error.ui10NativePreflight={status:'FAIL',results};throw error;}
 finally{await page.close({runBeforeUnload:false});}
}

/** Cheap formal-renderer gate with the initial small inventory. Geometry must
 * survive resize before we perform an explicit return from a native action. */
export async function runUi10WorkspacePreflight({page,workspace}){
 const results=[];
 for(const viewport of UI10_PREFLIGHT_VIEWPORTS){
  await page.setViewportSize(viewport);
  const frames=await workspace(false),frame=frames.workspace??frames;
  const host=await frame.frameElement();
  const sample=await host.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+Math.min(40,r.width/2),r.y+Math.min(60,r.height/2));return {viewport:{width:innerWidth,height:innerHeight},rect:r.toJSON(),hit:hit===n};});
  assert(sample.rect.width>0&&sample.rect.height>=96&&sample.rect.left>=0&&sample.rect.right<=viewport.width,'visible formal workspace before inventory visits');
  assert.equal(sample.hit,true,'formal workspace must receive pointer input');
  assert(await frame.locator('.workspace').isVisible());
  const nativeControls=assertUi10NativeControls(await page.evaluate(observeUi10NativeControls,false));
  await page.locator('#model-button').click();await page.locator('#native-dialog[open]').waitFor();await page.locator('#native-dialog button').click();
  await workspace(true);
  results.push({status:'PASS_INITIAL_WORKSPACE_AND_NATIVE_FIRST_CLICK',...sample,nativeControls});
 }
 await page.setViewportSize({width:1440,height:1000});await workspace(false);
 return {status:'PASS_BEFORE_POPULATED_VISITS',results};
}
