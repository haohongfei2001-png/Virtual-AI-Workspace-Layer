import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {nativeReturnGapRect} from './src/host/native-return-gap.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'gapModule'});
const browser=await chromium.launch({headless:true,args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});await page.route('**/*',r=>r.abort());
 await page.setContent(`<style>body{margin:0}#header{position:fixed;left:220px;top:0;width:780px;height:52px;pointer-events:none;z-index:30}#slot{width:780px;height:52px;pointer-events:none}#hit{position:fixed;left:220px;top:0;width:780px;height:700px}#reading{height:900px}#text{margin-left:100px;width:400px;padding-top:70px}</style><div id="hit"><div id="reading"><div id="text">Native content</div></div></div><header id="header"><div id="slot"></div></header>`);
 await page.addScriptTag({content:outputFiles[0].text});
 const checks=await page.evaluate(()=>{
  const q=s=>document.querySelector(s),root=q('#reading');let masked=false;
  const args={document,header:q('#header'),slot:q('#slot'),hitRoot:q('#hit'),readingRoot:root,isOwnedMask:n=>masked&&n===root};const ok=()=>!!gapModule.nativeReturnGapRect(args),out={readingBackground:ok()};
  root.style.visibility='hidden';out.unknownHiddenRejected=!ok();masked=true;out.ownedMaskUsesSameGeometry=ok();root.style.visibility='';masked=false;
  const obstacle=document.createElement('button');obstacle.style.cssText='position:fixed;left:234px;top:14px;width:2px;height:2px;padding:0;border:0;pointer-events:none';root.append(obstacle);out.tinyBetweenSamplesRejected=!ok();root.style.visibility='hidden';masked=true;out.maskDoesNotExcuseObstacle=!ok();root.style.visibility='';masked=false;obstacle.remove();
  const text=document.createTextNode('x'),box=document.createElement('span');box.style.cssText='position:fixed;left:234px;top:14px;width:0;height:0;font:2px monospace;overflow:visible';box.append(text);root.append(box);out.overflowTextRejected=!ok();box.remove();
  const css=document.createElement('style');css.textContent='#text::before{content:"";position:fixed;left:234px;top:14px;width:2px;height:2px;background:red}';document.head.append(css);out.generatedPaintRejected=!ok();css.remove();
  q('#text').style.position='relative';const decoration=document.createElement('style');decoration.textContent='#text::before{content:"";position:absolute;inset:0;box-sizing:border-box;margin:0;background:red}';document.head.append(decoration);out.containedDecorationAllowed=ok();decoration.textContent='#text::before{content:"";position:absolute;left:-100px;top:-60px;width:300px;height:100px;box-sizing:border-box;margin:0;background:red}';out.escapingDecorationRejected=!ok();
  q('#text').style.direction='rtl';decoration.textContent='#text::before{content:"";position:absolute;direction:rtl;left:0;right:400px;top:0;bottom:0;width:400px;height:20px;box-sizing:border-box;margin:0;background:red}';out.rtlOverconstraintRejected=!ok();q('#text').style.direction='';
  q('#text').style.width='400.6px';decoration.textContent='#text::before{content:"";position:absolute;inset:0;width:400.9px;height:20px;box-sizing:border-box;margin:0;background:red}';out.fractionalOverflowRejected=!ok();q('#text').style.width='400px';
  decoration.textContent='#text::before{content:"";position:absolute;inset:0;box-sizing:border-box;margin:0;offset-path:path("M 0 0 L -100 -70");offset-distance:100%;background:red}';out.motionPathRejected=!ok();
  decoration.textContent='#text::before{content:"";position:absolute;inset:0;box-sizing:border-box;margin:0;border-image-source:linear-gradient(red,red);border-image-outset:100px}';out.borderPaintOutsetRejected=!ok();decoration.remove();
  const shadowHost=document.createElement('div');shadowHost.style.cssText='position:fixed;left:500px;top:100px;width:0;height:0';root.append(shadowHost);shadowHost.attachShadow({mode:'open'}).innerHTML='<button style="position:fixed;left:234px;top:14px;width:2px;height:2px;padding:0;border:0"></button>';out.shadowOverflowRejected=!ok();shadowHost.remove();
  const custom=document.createElement('native-widget');root.append(custom);out.unknownCustomElementRejected=!ok();custom.remove();
  // A normal leaf still gets both pseudo checks and its text range, without
  // a normal-style query used only for the optional containment shortcut.
  const plainLeaf=document.createElement('span');plainLeaf.textContent='x';q('#text').append(plainLeaf);
  const originalStyle=window.getComputedStyle,originalRangeBounds=Range.prototype.getBoundingClientRect,leafQueries={normal:0,before:0,after:0,textRanges:0};
  window.getComputedStyle=function(node,pseudo){if(node===plainLeaf){if(!pseudo)leafQueries.normal++;else if(pseudo==='::before')leafQueries.before++;else if(pseudo==='::after')leafQueries.after++;}return originalStyle.call(this,node,pseudo);};
  Range.prototype.getBoundingClientRect=function(){if(this.comparePoint(plainLeaf.firstChild,0)===0&&this.comparePoint(plainLeaf.firstChild,plainLeaf.firstChild.length)===0)leafQueries.textRanges++;return originalRangeBounds.call(this);};
  try{out.normalLeafFullProofWithoutOptionalStyle=ok()&&leafQueries.normal===0&&leafQueries.before===1&&leafQueries.after===1&&leafQueries.textRanges===1;}finally{window.getComputedStyle=originalStyle;Range.prototype.getBoundingClientRect=originalRangeBounds;plainLeaf.remove();}
  globalThis.leafPaintQueries=leafQueries;
  // A union can cross the band even though all actual fragments are outside.
  // It is exclusion-only: such a union must use the original fragment proof.
  const separated=[-10,70].map(top=>{const n=document.createElement('span');n.style.cssText='position:fixed;left:234px;top:'+top+'px;width:0;height:0;font:2px monospace;overflow:visible';n.append(document.createTextNode('x'));root.append(n);return n;});
  out.intersectingTextUnionUsesIndividualFragments=ok();separated.forEach(n=>n.remove());
  root.append(box);let aggregateFallbackReason=null;args.onReject=value=>aggregateFallbackReason=value;
  Range.prototype.getBoundingClientRect=function(){return {x:NaN,y:70,width:2,height:2};};
  try{out.invalidTextUnionCannotHideOverflow=!ok()&&aggregateFallbackReason==='reading-paint-overlap';}finally{Range.prototype.getBoundingClientRect=originalRangeBounds;box.remove();delete args.onReject;}
  // Paint-contained leaves retain their old clipping proof even when their
  // overflowing text or generated paint would otherwise cross the header.
  const leaf=document.createElement('div');leaf.id='gap-contained-leaf';leaf.style.cssText='contain:paint;position:fixed;left:234px;top:70px;width:20px;height:2px;font:100px monospace;line-height:0';leaf.textContent='xxxxxxxxxxxxxxxx';root.append(leaf);
  const leafRange=document.createRange();leafRange.selectNodeContents(leaf);const leafTextBox=leafRange.getBoundingClientRect();
  out.leafTextActuallyCrossesHeaderBand=leaf.getBoundingClientRect().top>=40&&leafTextBox.top<40&&leafTextBox.bottom>8&&leafTextBox.left<260&&leafTextBox.right>1000;
  out.containedLeafTextAllowed=ok();leaf.style.contain='none';out.uncontainedLeafTextRejected=!ok();leaf.style.contain='paint';args.gapPolicy='first-empty-header-gap';out.containedLeafTextKeepsFirstGap=gapModule.nativeReturnGapRect(args)?.x===228;leaf.style.contain='none';out.uncontainedLeafTextStillBlocksAllGaps=!ok();delete args.gapPolicy;leaf.style.contain='paint';leaf.replaceChildren();
  const leafDecoration=document.createElement('style');leafDecoration.textContent='#gap-contained-leaf::before{content:"x";position:absolute;left:0;top:-62px;width:1000px;height:32px;background:red}';document.head.append(leafDecoration);
  out.containedLeafGeneratedPaintAllowed=ok();leaf.style.contain='none';out.uncontainedLeafGeneratedPaintRejected=!ok();leaf.remove();
  const readingContent=q('#text'),readingStyle=root.style.cssText;readingContent.remove();root.style.cssText='contain:paint;position:fixed;left:234px;top:70px;width:20px;height:2px';leafDecoration.textContent='#reading::before{content:"x";position:absolute;left:0;top:-62px;width:1000px;height:32px;background:red}';
  out.containedReadingRootGetsNoLeafException=!ok();leafDecoration.remove();root.style.cssText=readingStyle;root.append(readingContent);
  const many=document.createDocumentFragment();for(let i=0;i<3000;i++){const span=document.createElement('span');span.textContent='x';many.append(span);}q('#text').append(many);
  // More than the old element AND text-rectangle caps: complete proof passes,
  // but a tiny last descendant still blocks it (no early success/truncation).
  // Explicit paint containment permits a local proof without per-message
  // ranges/styles. An uncontained late fixed descendant still blocks below.
  const original=q('#text').style.cssText;q('#text').style.cssText='contain:paint;position:absolute;left:320px;top:70px;width:400px;height:400px';
  const oldRects=Range.prototype.getClientRects;let ranges=0;Range.prototype.getClientRects=function(){ranges++;return oldRects.call(this);};
  out.containedLongTranscriptLocal=ok()&&ranges===0;Range.prototype.getClientRects=oldRects;
  let followingReason=null;args.onReject=value=>followingReason=value;
  root.append(obstacle);out.containedBranchDoesNotSkipLaterSibling=!ok()&&followingReason==='reading-paint-overlap';obstacle.remove();
  const nested=document.createElement('div');readingContent.replaceWith(nested);nested.append(readingContent);nested.after(custom);
  followingReason=null;out.containedBranchDoesNotSkipAncestorSibling=!ok()&&followingReason==='reading-paint-opaque';custom.remove();nested.replaceWith(readingContent);delete args.onReject;
  const escaped=document.createElement('div');escaped.setAttribute('popover','manual');escaped.style.cssText='position:fixed;inset:0;margin:0;width:1000px;height:700px';q('#text').append(escaped);escaped.showPopover();
  out.containedTopLayerNotSkipped=!ok();escaped.hidePopover();escaped.remove();q('#text').style.cssText=original;
  let firstReject=null;args.onReject=stage=>{firstReject=stage;};
  const firstProofStarted=performance.now();out.longTranscriptAllowed=ok();const firstProofElapsed=performance.now()-firstProofStarted;delete args.onReject;
  // Observe this existing call once; the later injected-clock check stays separate.
  globalThis.longTranscriptFirstProof={allowed:out.longTranscriptAllowed,reason:firstReject,elapsedMs:firstProofElapsed,measurement:'nativeReturnGapRect-total'};
  root.append(obstacle);out.lateLongTranscriptObstacleRejected=!ok();obstacle.remove();
  root.append(box);let lateTextReason=null;args.onReject=value=>lateTextReason=value;out.lateLongTranscriptOverflowTextRejected=!ok()&&lateTextReason==='reading-paint-overlap';delete args.onReject;box.remove();
  root.append(custom);out.lateOpaqueDescendantRejected=!ok();custom.remove();
  let ticks=0,reason=null;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>ticks++});
  args.onReject=value=>reason=value;
  out.elapsedBudgetFailsClosed=!ok()&&reason==='reading-paint-budget';
  delete performance.now;delete args.onReject;
  let freshReject=null;args.onReject=stage=>{freshReject=stage;};
  const freshProofStarted=performance.now();out.freshProofAfterBudget=ok();const freshProofElapsed=performance.now()-freshProofStarted;delete args.onReject;
  globalThis.freshProofAfterBudgetDiagnostic={allowed:out.freshProofAfterBudget,reason:freshReject,elapsedMs:freshProofElapsed,measurement:'nativeReturnGapRect-total'};
  q('#text').replaceChildren(document.createTextNode('Native content'));
  const replacement=root.cloneNode(true);root.replaceWith(replacement);out.staleReadingRejected=!ok();replacement.replaceWith(root);
  out.restored=ok();
  const viewport=document.createElement('div');viewport.style.cssText='position:fixed;left:220px;top:0;width:780px;height:700px;overflow:auto';root.replaceWith(viewport);viewport.append(root);args.readingViewport=viewport;
  out.viewportReadingBackground=ok();root.style.visibility='hidden';masked=true;out.maskedViewportBackground=ok();
  const nativeExtra=document.createElement('div');viewport.append(nativeExtra);out.viewportExtraChildRejected=!ok();nativeExtra.remove();
  viewport.setAttribute('tabindex','0');out.interactiveViewportRejected=!ok();viewport.removeAttribute('tabindex');
  args.viewportFocus='native-scroll-region';out.originalNoninteractiveViewportAllowed=ok();delete args.viewportFocus;
  viewport.setAttribute('role','region');viewport.setAttribute('tabindex','0');out.regionWithoutProfileRejected=!ok();args.viewportFocus='native-scroll-region';out.explicitScrollRegionAllowed=ok();
  viewport.focus();out.nativeRegionFocusRetained=document.activeElement===viewport&&ok();
  viewport.setAttribute('role','button');out.actionRoleRejected=!ok();viewport.setAttribute('role','region');
  viewport.setAttribute('tabindex','1');out.positiveTabOrderRejected=!ok();viewport.setAttribute('tabindex','0');
  viewport.setAttribute('contenteditable','false');out.editableAttributeRejected=!ok();viewport.removeAttribute('contenteditable');
  viewport.style.overflow='visible';out.nonScrollingRegionRejected=!ok();viewport.style.overflow='auto';
  args.viewportFocus='unknown';out.unknownFocusPolicyRejected=!ok();args.viewportFocus='native-scroll-region';
  root.style.visibility='';masked=false;out.nativeReadingRegionAllowed=ok();root.style.visibility='hidden';masked=true;
  viewport.removeAttribute('role');viewport.removeAttribute('tabindex');delete args.viewportFocus;
  viewport.style.setProperty('--unused','1');const viewportPaint=document.createElement('style');viewport.id='viewport';viewportPaint.textContent='#viewport::before{content:"";position:fixed;left:234px;top:14px;width:2px;height:2px;background:red}';document.head.append(viewportPaint);out.viewportGeneratedPaintRejected=!ok();viewportPaint.remove();
  root.style.visibility='';masked=false;viewport.replaceWith(root);delete args.readingViewport;
  q('#text').style.paddingTop='0';q('#text').style.marginTop='70px';
  const wrapper=document.createElement('div');wrapper.style.cssText='width:780px;height:52px;pointer-events:none';
  const breadcrumb=document.createElement('a');breadcrumb.href='#project';breadcrumb.textContent='Project';breadcrumb.style.cssText='position:absolute;left:8px;top:8px;width:140px;height:36px;pointer-events:auto';wrapper.append(breadcrumb);q('#slot').append(wrapper);
  out.nativeBreadcrumbRejectsFixedGap=!ok();args.headerLayout='transparent-containers';args.gapPolicy='first-empty-header-gap';
  const shifted=gapModule.nativeReturnGapRect(args);out.breadcrumbGap=shifted?.x===376&&shifted?.width===32;
  const tiny=document.createElement('button');tiny.style.cssText='position:fixed;left:390px;top:14px;width:2px;height:2px;padding:0;border:0;pointer-events:none';root.append(tiny);out.shiftedGapAvoidsReading=gapModule.nativeReturnGapRect(args)?.x===400;
  const returnButton=document.createElement('button');returnButton.style.cssText='position:fixed;left:400px;top:8px;width:32px;height:32px;padding:0;border:0;z-index:30';document.body.append(returnButton);args.button=returnButton;
  out.relocatedButtonRevalidates=ok();returnButton.style.left='228px';out.oldButtonPositionRejected=!ok();delete args.button;returnButton.remove();
  tiny.style.width='700px';out.noGapAcrossReadingRejected=!ok();tiny.remove();
  wrapper.style.backgroundColor='rgb(250, 250, 250)';out.paintedContainerWithoutProfileRejected=!ok();args.headerLayout='plain-containers';out.plainNativeBackgroundAllowed=ok();wrapper.style.backgroundImage='linear-gradient(red,red)';out.backgroundImageStillRejected=!ok();wrapper.style.backgroundImage='none';wrapper.style.backgroundColor='transparent';
  wrapper.style.pointerEvents='auto';out.opaqueContainerStillRejects=!ok();wrapper.style.pointerEvents='none';
  breadcrumb.style.width='760px';out.noRemainingGapRejected=!ok();breadcrumb.style.width='140px';
  args.gapPolicy='unknown';out.unknownGapPolicyRejected=!ok();args.gapPolicy='first-empty-header-gap';
  out.breadcrumbRemainsNative=breadcrumb.parentElement===wrapper&&breadcrumb.getAttribute('href')==='#project'&&getComputedStyle(breadcrumb).pointerEvents==='auto';
  wrapper.remove();out.emptyHeaderKeepsOriginalGap=gapModule.nativeReturnGapRect(args)?.x===228;delete args.gapPolicy;
  const clipped=document.createElement('div');clipped.style.cssText='position:fixed;left:220px;top:52px;width:780px;height:500px;overflow:auto';root.replaceWith(clipped);clipped.append(root);args.readingViewport=clipped;
  q('#text').style.cssText='height:100px;width:400px;margin:0';clipped.scrollTop=52;
  out.scrolledNativeContentClippedFromHeader=ok();
  const escape=document.createElement('button');escape.style.cssText='position:fixed;left:234px;top:14px;width:2px;height:2px;padding:0;border:0;pointer-events:none';root.append(escape);
  out.fixedDescendantNotExcusedByClip=!ok();escape.remove();
  clipped.style.position='static';clipped.style.marginTop='52px';const absolute=document.createElement('button');absolute.style.cssText='position:absolute;left:14px;top:14px;width:2px;height:2px;padding:0;border:0;pointer-events:none';root.append(absolute);
  out.externalAbsoluteNotExcusedByClip=!ok();absolute.remove();
  clipped.replaceWith(root);delete args.readingViewport;
  return out;
 });
 await page.evaluate(()=>{const root=document.querySelector('#reading'),v=document.createElement('div');v.id='keyboard-viewport';v.setAttribute('role','region');v.tabIndex=0;v.style.cssText='height:300px;overflow:auto';root.replaceWith(v);v.append(root);v.focus();});
 await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.querySelector('#keyboard-viewport').scrollTop>0,null,{timeout:1000});
 checks.nativeKeyboardScroll=await page.evaluate(()=>document.activeElement===document.querySelector('#keyboard-viewport'));
 console.log(JSON.stringify(await page.evaluate(()=>({longTranscriptFirstProof:globalThis.longTranscriptFirstProof,freshProofAfterBudgetDiagnostic:globalThis.freshProofAfterBudgetDiagnostic,leafPaintQueries:globalThis.leafPaintQueries}))));
 assert(Object.values(checks).every(Boolean),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks}));
}finally{await browser.close();}
