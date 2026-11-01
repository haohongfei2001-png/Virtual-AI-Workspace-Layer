import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {waitForHistoryControl} from './j3-control-wait.mjs';
const source=readFileSync(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');
function clock(){let t=0;return {now:()=>t,pause:async ms=>{t+=ms;}};}
test('same visible locator can enable after a rerender without a second DOM selector',async()=>{let checks=0;const locator=Object.freeze({isEnabled:async()=>++checks===3});await waitForHistoryControl(locator,clock());assert.equal(checks,3);});
test('permanently disabled control is rejected at the original 30 second deadline',async()=>{const time=clock();let checks=0;await assert.rejects(waitForHistoryControl(Object.freeze({isEnabled:async()=>{checks++;return false;}}),time),/30000ms/);assert.equal(time.now(),30000);assert.equal(checks,600);});
test('enabled control returns immediately without mutation or delay',async()=>{const time=clock();await waitForHistoryControl(Object.freeze({isEnabled:async()=>true}),time);assert.equal(time.now(),0);});
test('locator errors fail closed',async()=>{await assert.rejects(waitForHistoryControl({isEnabled:async()=>{throw Error('detached');}},clock()),/detached/);});
test('runner uses the same role locator for visible enabled click and segment assertion',()=>{assert(source.includes("const older=frames.workspace.getByRole('button',{name:'较早的30日',exact:true});await older.waitFor({state:'visible'});"));assert(source.includes('await waitForHistoryControl(older);'));assert(source.includes('const olderAvailable=await older.isEnabled();assert.equal(olderAvailable,true);await older.click();'));assert(source.includes("await frames.workspace.locator('.workspace[data-segment=\"1\"]').waitFor()"));assert(!source.includes('force:true'));});
test('diagnostics traverse the same actual DOM through Playwright locators',()=>{assert(source.includes("reader.getByRole('button').evaluateAll"));assert(source.includes("reader.locator('.workspace').evaluateAll"));assert(!source.includes("document.querySelector('main > [data-vaiwl-owned]')"));});
