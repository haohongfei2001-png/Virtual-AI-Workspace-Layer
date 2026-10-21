/** Narrow DOM observations, not visual golden or business authority. */
import assert from 'node:assert/strict';
export function assertUi10ReadingReturn({count,text,label}){
 assert.equal(count,1,'reading must have exactly one return control');
 assert.equal(label,'返回工作空间','icon control retains its accessible name');
 assert.equal(text,'▦','return is the actual icon glyph, not visible text navigation');
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
