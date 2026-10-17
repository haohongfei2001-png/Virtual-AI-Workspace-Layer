import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');
test('old-window native history explicitly surrenders via real composer before clicking history',()=>{
 const begin=source.indexOf('// Continue the same original document'),end=source.indexOf("record('old-window-reopen'",begin),step=source.slice(begin,end);
 const click=step.indexOf("await page.locator('#prompt-textarea').click()"),released=step.indexOf("assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0)"),visible=step.indexOf("await nativeHistory.waitFor({state:'visible'})"),navigate=step.indexOf('await nativeHistory.click()');
 assert(click>=0);assert(released>click);assert(visible>released);assert(navigate>visible);assert(step.includes('await draft()'));assert(step.includes('assert.deepEqual(historyAfter.evidence.events[originalEvent.id],originalEvent)'));assert(step.includes(".workspace[data-segment=\"1\"]"));
});
test('production protected composer input hides both masks without exiting session',()=>{
 const surface=readFileSync(new URL('../../src/navigation/mount-surface.mjs',import.meta.url),'utf8');assert(surface.includes('protectedNodes=[inspection.composer,inspection.header'));assert(surface.includes("const nativeInput=e=>{if(protectedNodes.some(n=>n===e.target||n.contains(e.target))){hide(m);"));assert(surface.includes("doc.addEventListener('pointerdown',nativeInput,true)"));assert(surface.includes("onSurrender({reason:'native-input'})"));
});
test('runner never forces history click or calls private surface controls',()=>{assert(!source.includes('force:true'));assert(!source.includes('.showNativeReading('));assert(!source.includes("getByRole('button',{name:'退出工作空间增强'"));});
