import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {UI10_H_POLICIES,UI10_INTERACTION_VIEWS,assertUi10InteractionCoverage,ensureUi10QueryProbe} from './ui10-interaction-matrix.mjs';
const fixture=()=>({sidebarMode:'FORMAL',views:UI10_INTERACTION_VIEWS.map(view=>({view,status:'PASS',continuity:true})),hPolicies:[...UI10_H_POLICIES],searchFocusRestored:true,uniqueReadingReturn:true,nativeActionsUnchanged:true,fullV27Acceptance:'NOT_ESTABLISHED'});
test('eight views six committed policies',()=>assert(assertUi10InteractionCoverage(fixture())));
for(const field of ['searchFocusRestored','uniqueReadingReturn','nativeActionsUnchanged'])test('reject missing '+field,()=>{const r=fixture();r[field]=false;assert.throws(()=>assertUi10InteractionCoverage(r));});
for(const change of [r=>r.views.pop(),r=>r.views.push(r.views[0]),r=>r.views[0].continuity=false,r=>r.views[0].status='NOT_RUN',r=>r.hPolicies.pop(),r=>r.fullV27Acceptance='PASS'])test('reject incomplete or inflated coverage '+change.toString(),()=>{const r=fixture();change(r);assert.throws(()=>assertUi10InteractionCoverage(r));});
test('real controls no seeded authority',()=>{const s=readFileSync(new URL('./ui10-interaction-matrix.mjs',import.meta.url),'utf8')+readFileSync(new URL('./ui10-horizon-commit.mjs',import.meta.url),'utf8');for(const x of ['updateFrameProjection','indexedDB.open','addStyleTag','page.reload','page.goto'])assert(!s.includes(x));for(const x of ["press('Enter')",'selectOption(value)','nativeActions(),actionsBefore','timeout:6000'])assert(s.includes(x));});
test('runner opt in, restore not repeated',()=>{const s=readFileSync(new URL('./ui10-package-matrix-browser.mjs',import.meta.url),'utf8');assert(s.includes("process.env.FREE_UI10_INTERACTIONS==='1'"));assert(s.includes("runInteractions&&phase!=='restored'"));});

test('safe native sidebar fallback still exercises every workspace control',()=>{const r=fixture();r.sidebarMode='NATIVE_RETAINED';r.views=r.views.filter(v=>!v.view.startsWith('sidebar-'));assert(assertUi10InteractionCoverage(r));r.views.pop();assert.throws(()=>assertUi10InteractionCoverage(r));});

test('query probe installs once, survives same-document navigation, and renews after a new document',async()=>{
 const seen=new WeakSet(),globals={};let checks=0,installs=0;
 const frame={evaluate:async(fn,arg)=>{if(arg){assert.equal(fn.name,'installSnippetsQueryProbe');assert.equal(arg.role,'workspace');assert(!globals.__vaiwlSnippetQueryProbe);globals.__vaiwlSnippetQueryProbe={};installs++;return;}checks++;return new Function('globalThis',`return (${fn.toString()})();`)(globals);}};
 await ensureUi10QueryProbe(frame,'workspace',seen);await ensureUi10QueryProbe(frame,'workspace',seen);assert.equal(installs,1);assert.equal(checks,1);
 seen.delete(frame);await ensureUi10QueryProbe(frame,'workspace',seen);assert.equal(installs,1);assert.equal(checks,2);
 seen.delete(frame);delete globals.__vaiwlSnippetQueryProbe;await ensureUi10QueryProbe(frame,'workspace',seen);assert.equal(installs,2);assert.equal(checks,3);
 await ensureUi10QueryProbe(null,'sidebar',seen);assert.equal(checks,3);
});
