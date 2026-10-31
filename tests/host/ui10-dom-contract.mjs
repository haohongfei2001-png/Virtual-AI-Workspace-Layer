/** Narrow DOM observations, not visual golden or business authority. */
import assert from 'node:assert/strict';
// Observe the approved SVG in the actual control. Empty text alone would also
// accept an invisible/blank button; importing the product icon would not prove
// that the real Host mounted it.
export function observeUi10ReadingReturn(control){
 const icons=[...control.querySelectorAll('svg')],icon=icons[0];
 return {text:control.textContent,label:control.getAttribute('aria-label'),svgCount:icons.length,
  viewBox:icon?.getAttribute('viewBox'),hidden:icon?.getAttribute('aria-hidden'),focusable:icon?.getAttribute('focusable'),
  cells:[...(icon?.querySelectorAll('rect')??[])].map(n=>['x','y','width','height'].map(k=>Number(n.getAttribute(k))))};
}
export function assertUi10ReadingReturn({count,text,label,svgCount,viewBox,hidden,focusable,cells}){
 assert.equal(count,1,'reading must have exactly one return control');
 assert.equal(label,'返回工作空间','icon control retains its accessible name');
 assert.equal(text,'','return has no permanent text label');
 assert.equal(svgCount,1,'return has one actual grid icon');
 assert.equal(viewBox,'0 0 24 24');assert.equal(hidden,'true');assert.equal(focusable,'false');
 assert.deepEqual(cells,[[3,3,7,7],[14,3,7,7],[3,14,7,7],[14,14,7,7]],'return shows four distinct grid cells');
 return true;
}
export function assertUi10CardHeadControls(controls){
 for(const c of controls){
  assert(Array.isArray(c.classes),'observed classes required');
  assert(c.classes.includes('square')&&c.classes.includes('card-actions')&&c.popup==='menu','homepage expanded header control must be an actions menu, not whole-card collapse');
  assert(['true','false'].includes(c.expanded),'menu expanded state must be explicit');
 }
 return true;
}
