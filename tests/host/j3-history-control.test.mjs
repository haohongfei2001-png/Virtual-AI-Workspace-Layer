import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./j3-package-journey.mjs',import.meta.url),'utf8');
// Execute the runner's actual in-frame predicate, without starting a server/browser.
const line=source.split('\n').find(line=>line.includes("frames.workspace.waitForFunction("));
assert(line,'missing J3 historical control predicate');
const predicate=line.trim().slice('await frames.workspace.waitForFunction('.length,-2);
const control=({label='较早的30日',text='',disabled=false}={})=>Object.freeze({textContent:text,disabled,getAttribute:name=>name==='aria-label'?label:null});
function check(buttons,{missingRoot=false,lightButtons=[]}={}){const shadowRoot=Object.freeze({querySelectorAll(selector){assert.equal(selector,'button');return buttons;}});return runInNewContext('('+predicate+')()',{document:{querySelector(selector){assert.equal(selector,'main > [data-vaiwl-owned]');return missingRoot?null:{shadowRoot};},querySelectorAll(selector){assert.equal(selector,'button');return lightButtons;}}});}
test('J3 ignores light-DOM impostors and missing navigation root',()=>{assert.equal(check([],{lightButtons:[control()]}),false);assert.equal(check([control()],{missingRoot:true}),false);});
test('J3 recognizes enabled SVG-only interval button through its accessible label',()=>{assert.equal(check([control()]),true);});
test('J3 still refuses a disabled interval button and never mutates it',()=>{const button=control({disabled:true});assert.equal(check([button]),false);assert.equal(button.disabled,true);});
test('J3 refuses text-only impersonation of the interval control',()=>{assert.equal(check([control({label:'Other native action',text:'较早的30日'})]),false);});
test('J3 rejects wrong horizon missing label and no button',()=>{for(const buttons of [[],[control({label:'较早的60日'})],[control({label:null})]])assert.equal(check(buttons),false);});
test('J3 retains enabled assertion native click segment transition and deadline',()=>{assert(source.includes('const olderAvailable=await older.isEnabled();assert.equal(olderAvailable,true);await older.click();'));assert(source.includes("await frames.workspace.locator('.workspace[data-segment=\"1\"]').waitFor()"));assert(!line.includes('timeout:'));assert(!source.includes('force:true'));});
test('production graphics preserve label while replacing visible text with SVG',()=>{const renderer=readFileSync(new URL('../../src/navigation/navigation.mjs',import.meta.url),'utf8');assert(renderer.includes("graphic(button('较早的'+span()+'日'"));assert.match(renderer,/function graphic\(b,kind\).*b\.innerHTML='<svg/);assert.match(renderer,/'aria-label':label/);});
test('runner root matches the real open-shadow frame renderer and diagnostics',()=>{const renderer=readFileSync(new URL('../../src/navigation/navigation.mjs',import.meta.url),'utf8'),entry=readFileSync(new URL('../../extension/workspace.mjs',import.meta.url),'utf8');assert(renderer.includes("'data-vaiwl-owned':token"));assert(renderer.includes("n.attachShadow({mode:'open'})"));assert(renderer.includes('surface.root.append(pane.n)'));assert(entry.includes("privateRoot:document.querySelector('main')"));assert(source.includes("const root=document.querySelector('main > [data-vaiwl-owned]')?.shadowRoot"));assert(source.includes("segment:root?.querySelector('.workspace')?.dataset.segment"));});
