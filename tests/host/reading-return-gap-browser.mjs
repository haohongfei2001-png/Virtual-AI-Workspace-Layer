import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {nativeReturnGapRect} from './src/host/native-return-gap.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'gapModule'});
const browser=await chromium.launch({headless:true});
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
  const many=document.createDocumentFragment();for(let i=0;i<2048;i++)many.append(document.createElement('span'));q('#text').append(many);out.scanOverflowRejected=!ok();q('#text').replaceChildren(document.createTextNode('Native content'));
  const replacement=root.cloneNode(true);root.replaceWith(replacement);out.staleReadingRejected=!ok();replacement.replaceWith(root);
  out.restored=ok();
  const viewport=document.createElement('div');viewport.style.cssText='position:fixed;left:220px;top:0;width:780px;height:700px;overflow:auto';root.replaceWith(viewport);viewport.append(root);args.readingViewport=viewport;
  out.viewportReadingBackground=ok();root.style.visibility='hidden';masked=true;out.maskedViewportBackground=ok();
  const nativeExtra=document.createElement('div');viewport.append(nativeExtra);out.viewportExtraChildRejected=!ok();nativeExtra.remove();
  viewport.setAttribute('tabindex','0');out.interactiveViewportRejected=!ok();viewport.removeAttribute('tabindex');
  viewport.style.setProperty('--unused','1');const viewportPaint=document.createElement('style');viewport.id='viewport';viewportPaint.textContent='#viewport::before{content:"";position:fixed;left:234px;top:14px;width:2px;height:2px;background:red}';document.head.append(viewportPaint);out.viewportGeneratedPaintRejected=!ok();viewportPaint.remove();
  root.style.visibility='';masked=false;viewport.replaceWith(root);delete args.readingViewport;return out;
 });assert(Object.values(checks).every(Boolean),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks}));
}finally{await browser.close();}
