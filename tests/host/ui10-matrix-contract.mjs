/** UI-10 test inputs and reusable shell checks, not a new visual oracle.
 * Sources: VAIWL_OFFLINE_ACCEPTANCE.md §4.5 UI-10 / §5.3;
 * frame-shell-layout-browser.mjs bounded()/sample(). No browser is launched.
 */
import assert from 'node:assert/strict';
import {observeUi10ShellConsistently} from './ui10-shell-observation.mjs';

export const UI10_PROFILES=Object.freeze(['LEGACY','MODERN','PARTIAL']);
export const UI10_BROWSER='chrome-mv3-runner'; // Current package runner; no invented cross-browser support.
export const UI10_REQUIRED_VIEWS=Object.freeze([
 'home','reading-unique-return','sidebar-open','sidebar-closed','old-items-expanded',
 'empty-history-segment','long-list-end','working-set','snippets','search','H-settings',
]);
export const UI10_LONG_CHINESE='长期研究项目与知识管理中文标题'.repeat(12);

export function ui10Cases(){
 const cases=[];
 for(const profile of UI10_PROFILES)
 for(const width of [1440,420])
 for(const colorScheme of ['light','dark'])
 for(const title of ['ordinary','long-Chinese'])
 for(const height of [1000,520])cases.push({
  id:[profile,width,colorScheme,title,height].join('/'),profile,browser:UI10_BROWSER,
  viewport:{width,height},colorScheme,title,
  fixtureTitle:title==='long-Chinese'?UI10_LONG_CHINESE:null,
  heightEvidence:height===520?'RESIZE_PROXY_NOT_PHYSICAL_KEYBOARD':'BASELINE_VIEWPORT',
  zoom:1,expected:'POSITIVE_SUPPORTED_PROFILE',nativeEvidence:'NOT_RUN',
 });
 return cases;
}

/** Set only browser-owned viewport/media; never rewrite native DOM or CSS zoom.
 * The caller must supply long titles through its native fixture data channel.
 * Resizing is not evidence of a physical keyboard, IME, or mobile viewport API.
 */
export async function configureUi10Environment(page,cell){
 assert(ui10Cases().some(candidate=>JSON.stringify(candidate)===JSON.stringify(cell)),'unknown-ui10-cell');
 await page.setViewportSize({...cell.viewport});
 await page.emulateMedia({colorScheme:cell.colorScheme});
 return {nativeEvidence:'NOT_RUN',physicalKeyboard:'NOT_RUN',physicalIME:'NOT_RUN'};
}

/** Exact 1px bounds from the existing packaged shell oracle, not UI-10 acceptance. */
export function assertUi10ShellBounds(m,outer){
 assert(m.width>0&&m.height>0);
 assert(m.document.scrollHeight<=m.height+1,JSON.stringify(m));
 assert(m.document.scrollWidth<=m.width+1,JSON.stringify(m));
 assert.equal(m.scrollX,0);assert.equal(m.scrollY,0);
 assert(m.main.height>0&&m.main.y>=-1&&m.main.y+m.main.height<=m.height+1,JSON.stringify(m));
 if(outer.backend==='document-flow'){
  assert(outer.frame.top>=outer.surface.top-1&&outer.frame.bottom<=outer.surface.bottom+1,JSON.stringify(outer));
  assert.equal(outer.closeHit,true,'flow exit must remain hit-testable');
  assert(outer.close.top>=outer.surface.top-1&&outer.close.bottom<=outer.surface.bottom+1&&outer.close.left>=outer.surface.left-1&&outer.close.right<=outer.surface.right+1,JSON.stringify(outer));
  assert.equal(outer.closeCoversControl,false,'flow exit must not cover a renderer control');
 }else assert(outer.frame.top>=outer.close.bottom-1&&outer.frame.bottom<=outer.surface.bottom+1,JSON.stringify(outer));
}

/** Read-only Playwright frame sampler. No generated DOM, styles, goldens or clicks. */
export async function observeUi10Shell(frame){
 return observeUi10ShellConsistently(frame,assertUi10ShellBounds);
}

/** Preparation cannot manufacture native PASS from deterministic contracts. */
export function ui10PreparationReport(){
 return {
  requirement:'UI-10',kind:'L_MATRIX_CONTRACT_PREPARATION',nativeMatrix:'NOT_RUN',
  fullV27Acceptance:'NOT_ESTABLISHED',physicalKeyboard:'NOT_RUN',physicalIME:'NOT_RUN',realChatGPT:'NOT_RUN',
  baseline:{status:'REQUIRED_NOT_SUPPLIED_BY_THIS_MODULE',source:'approved v2.7 + current Free targets',sameDimensions:true,generateFromCandidate:false},
  inheritedZoom:{runner:'tests/host/j3-package-journey.mjs',method:'chrome.tabs.setZoom/getZoom(2)',status:'EXISTING_J3_EVIDENCE_NOT_RERUN_OR_EXPANDED',appliesToNewCells:false},
  requiredViews:[...UI10_REQUIRED_VIEWS],
  preservedRequirements:['3-column responsive layout','5-preview/+12','left old-items arrow','no home-card collapse','no up arrow in current segment','all H policies','working sets/snippets/search','font tokens','native node/handler/draft/file continuity','focus/AX restoration','native overlays surrender','unique reading return'],
  excludedAsPositive:['FAULT'],
  remainingNativeEvidence:['packaged MV3 at every matrix cell','native fixture titles actually observed','approved same-size visual baseline comparisons','all required views and interactions','native continuity and focus/AX assertions','actual keyboard/IME U'],
  cells:ui10Cases(),
 };
}

/** Resize down and restore the same native document; observer owns the existing
 * draft/node/AX checks. A failed observation stops immediately, never reopens a
 * surface or reloads a page to hide the failure. This is a resize proxy only.
 */
export async function exerciseUi10HeightChange(page,cell,observe){
 assert.equal(typeof observe,'function');
 const observations=[];
 for(const [phase,height] of [['before',1000],['reduced',520],['restored',1000]]){
  const candidate=ui10Cases().find(c=>c.profile===cell.profile&&c.viewport.width===cell.viewport.width&&c.colorScheme===cell.colorScheme&&c.title===cell.title&&c.viewport.height===height);
  // Validate the original as well, rather than silently accepting changed metadata.
  assert(ui10Cases().some(c=>JSON.stringify(c)===JSON.stringify(cell)),'unknown-ui10-cell');
  await configureUi10Environment(page,candidate);
  observations.push({phase,height,result:await observe({phase,cell:candidate})});
 }
 return {kind:'RESIZE_PROXY_NOT_PHYSICAL_KEYBOARD',physicalKeyboard:'NOT_RUN',observations};
}
