import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444';
test('J3 drafts and attachment require preserved-page href even with loaded native handle',()=>{
 let clicks=0;const handle={id:'h',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'},node={isConnected:true,click(){clicks++;}};
 const actions=createNativeActions({discovery:{getNode:()=>node},urlPolicy:createURLPolicy(),currentURL:()=>`https://chatgpt.com/c/${D}`,inputRisk:()=>({state:'unsaved',flags:['composer','attachment']})});
 const plan=actions.planNavigation({kind:'resolved',entity:'conversation',nativeId:C,navigationURL:`https://chatgpt.com/c/${C}`,liveHandle:handle});assert.equal(plan.mode,'href');assert.equal(plan.disposition,'new-tab-preserve-current');assert.equal(clicks,0);
});
const source=readFileSync(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');
test('J3 locks target URL and _blank then captures real page without waiting original URL to change',()=>{assert(source.includes("assert.equal(report.oldWindowLink.href,oldURL)"));assert(source.includes("assert.equal(report.oldWindowLink.target,'_blank')"));assert(source.includes("context.waitForEvent('page',{timeout:30000}),old.click()"));assert(source.includes('assert.equal(oldPage.url(),oldURL);assert.equal(page.url(),preservedURL);await draft();'));assert(source.includes("record('old-window-safe-new-tab','PASS'"));});
test('same-document old-window reopening is separately proven after explicit native action',()=>{assert(source.includes("const nativeHistory=page.locator('aside nav[aria-label=\"Chat history\"] a').filter({hasText:'Ordinary conversation'})"));assert(source.includes("await nativeHistory.waitFor({state:'visible'});await nativeHistory.click()"));assert(source.includes("navigation:'explicit-native-history-after-safe-new-tab'"));assert(source.includes('assert.deepEqual(historyAfter.evidence.events[originalEvent.id],originalEvent)'));assert(!source.includes('force:true'));});
