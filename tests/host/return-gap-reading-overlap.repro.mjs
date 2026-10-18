import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Actual Chromium geometry + actual helper. Synthetic local HTML only.
// This intentionally exposes the unsupported scrolled-reading layout against the 9509be1 readingRoot API.
const moduleURL=process.env.VAIWL_PLAYWRIGHT_MODULE?pathToFileURL(process.env.VAIWL_PLAYWRIGHT_MODULE):new URL('../b1/tooling/node_modules/playwright/index.mjs',import.meta.url);
const {chromium}=await import(moduleURL.href);
const source=await readFile(new URL('../../src/host/native-return-gap.mjs',import.meta.url),'utf8');
const mountSource=await readFile(new URL('../../src/navigation/mount-surface.mjs',import.meta.url),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.VAIWL_CHROMIUM_EXECUTABLE?{executablePath:process.env.VAIWL_CHROMIUM_EXECUTABLE}:{})});});
after(async()=>{await browser?.close();});

const html=`<!doctype html><meta charset="utf-8"><style>
body{margin:0}#background{position:fixed;left:220px;top:0;width:780px;height:700px}
#header{position:fixed;left:220px;top:0;width:780px;height:52px;pointer-events:none;z-index:30}
#slot{width:780px;height:52px;pointer-events:none}
#viewport{position:fixed;left:220px;top:0;width:780px;height:700px;overflow:auto}
#reading{position:relative;height:1800px}article{position:absolute;left:100px;top:900px}
#composer{height:100px}#history{position:fixed;left:0;top:52px;width:200px;height:648px}
</style><nav id="history"></nav><div id="background">
<div id="viewport" role="region" tabindex="0"><div id="reading"><article>synthetic message</article></div><footer id="composer"><textarea>synthetic unsent draft</textarea></footer></div></div>
<header id="header"><div id="slot"></div></header>`;

async function fixture(t){
 const page=await browser.newPage({viewport:{width:1000,height:700}});t.after(()=>page.close());
 const url='https://example.invalid/return-gap-fixture';
 await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:html}):route.abort());
 await page.goto(url);
 await page.addScriptTag({type:'module',content:source+'\nwindow.nativeReturnGapRect=nativeReturnGapRect;'});
 await page.addScriptTag({type:'module',content:mountSource+'\nwindow.createMountSurface=createMountSurface;'});
 await page.evaluate(async()=>{
  const get=id=>document.getElementById(id);get('viewport').scrollTop=600;
  const originalRoot=get('background'),surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const handle=await surface.mount({binding:{documentToken:'synthetic'}},{ok:true,viewMask:'declarative-css',regionEpoch:1,reading:get('reading'),readingViewport:get('viewport'),historyMaskRoots:[get('history')],protectedRegions:[get('header'),get('composer')],header:get('header'),composer:get('composer'),readingRect:{x:220,y:52,width:780,height:648},sidebarRect:{x:0,y:52,width:200,height:648}});
  window.probe={get,originalRoot,surface,handle,
   hit:()=>document.elementsFromPoint(246,26)[0]?.id,
   mask:on=>on?surface.showWorkspace(handle):surface.showReading(handle),
   check:(root=originalRoot)=>nativeReturnGapRect({document,header:get('header'),slot:get('slot'),hitRoot:root,readingRoot:get('reading'),isOwnedMask:node=>surface.isMasked(node),excluded:[get('history'),get('composer')],excludedRects:[{x:220,y:52,width:780,height:648}]}),
   tiny:()=>{const button=document.createElement('button');button.id='tiny-native';button.style.cssText='position:fixed;left:234px;top:14px;width:2px;height:2px;padding:0;border:0';get('reading').append(button);return button;},
  };
 });
 return page;
}

test('fixture really crosses header; own CSS mask changes hit reading -> viewport -> reading',async t=>{
 const p=await fixture(t);const facts=await p.evaluate(()=>{
  const r=probe.get('reading').getBoundingClientRect(),before=probe.hit();probe.mask(true);const masked=probe.hit(),ownedReading=probe.surface.isMasked(probe.get('reading')),ownedViewport=probe.surface.isMasked(probe.get('viewport'));probe.mask(false);
  return {crosses:r.y<0&&r.bottom>52,before,masked,ownedReading,ownedViewport,after:probe.hit(),draft:document.querySelector('textarea').value,nativeHidden:probe.get('reading').hidden,nativeInert:probe.get('reading').inert};
 });
 assert.deepEqual(facts,{crosses:true,before:'reading',masked:'viewport',ownedReading:true,ownedViewport:false,after:'reading',draft:'synthetic unsent draft',nativeHidden:false,nativeInert:false});
});

for(const masked of [false,true])test(`empty header gap remains usable with owned mask ${masked?'open':'closed'} [regression]`,async t=>{
 const p=await fixture(t);const result=await p.evaluate(masked=>{probe.mask(masked);return probe.check();},masked);
 assert.deepEqual(result,{x:228,y:8,width:36,height:36});
});

test('legacy empty-background layout is still accepted',async t=>{
 const p=await fixture(t);assert.notEqual(await p.evaluate(()=>{probe.get('viewport').style.top='52px';return probe.check();}),null);
});

test('2px native control between all five sample points is rejected',async t=>{
 const p=await fixture(t);const result=await p.evaluate(()=>{
  const button=probe.tiny(),r=button.getBoundingClientRect();
  return {sampleHits:[[229,9],[263,9],[229,43],[263,43],[246,26]].map(([x,y])=>document.elementFromPoint(x,y).id),tinyHit:document.elementFromPoint(r.x+1,r.y+1).id,result:probe.check()};
 });
 assert.deepEqual(result.sampleHits,Array(5).fill('reading'));assert.equal(result.tinyHit,'tiny-native');assert.equal(result.result,null);
});

test('current readingRoot proof rejects a 2px obstacle with the actual owned mask active',async t=>{
 const p=await fixture(t);const result=await p.evaluate(()=>{probe.tiny();probe.mask(true);return probe.check();});
 assert.equal(result,null);
});

for(const mutation of ['replace-root','hidden-ancestor','inert-ancestor','aria-hidden-ancestor','native-header-control','native-portal'])test(`existing safe-background refusal preserved: ${mutation}`,async t=>{
 const p=await fixture(t);const result=await p.evaluate(mutation=>{
  probe.get('viewport').style.top='52px';
  if(mutation==='replace-root'){const old=probe.originalRoot;old.replaceWith(old.cloneNode());}
  if(mutation==='hidden-ancestor')document.body.hidden=true;
  if(mutation==='inert-ancestor')document.body.inert=true;
  if(mutation==='aria-hidden-ancestor')document.body.setAttribute('aria-hidden','true');
  if(mutation==='native-header-control'){const n=probe.tiny();probe.get('slot').append(n);}
  if(mutation==='native-portal'){const n=probe.tiny();n.style.cssText='position:fixed;left:228px;top:8px;width:36px;height:36px;z-index:31';document.body.append(n);}
  return probe.check();
 },mutation);assert.equal(result,null);
});
