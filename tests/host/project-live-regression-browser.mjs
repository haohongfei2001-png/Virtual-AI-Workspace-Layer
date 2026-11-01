/** Current Project proof + membership regressions, not live/MV3 acceptance. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {projectLiveHTML,projectLiveEvidence} from './fixtures/project-live-20261101.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const baseline=process.env.FREE_PROJECT_BASELINE_REF;
const plugins=baseline?[{name:'production-before-fix',setup(build){build.onLoad({filter:/src\/host\/(chatgpt-adapter|chatgpt-observed-profile|native-surface-boundary|surface-controller|local-status)\.mjs$/},args=>({contents:execFileSync('git',['show',`${baseline}:${args.path.slice(process.cwd().length+1)}`],{encoding:'utf8'}),loader:'js'}));}}]:[];
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createSurfaceDiscovery} from './src/host/surface-discovery.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';",resolveDir:process.cwd()},plugins,bundle:true,write:false,format:'iife',globalName:'projectRegression'});
const project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',cid='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/g/'+project+'/project';
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']});
const report={status:'RUNNING',evidence:'BROWSER_MECHANISM_ONLY',realChatGPT:'NOT_RUN',baseline:baseline??null,browser:browser.version(),fixture:projectLiveEvidence,checks:[]};
try{
 for(const mode of ['positive','missing-controls','missing-label','wrong-controls','wrong-label','duplicate-panel-id','duplicate-tab-id','changed-relation','stage-structure','stage-geometry','stage-header','stage-identity','flow-continuity']){
  const context=await browser.newContext({viewport:projectLiveEvidence.viewport,serviceWorkers:'block'}),page=await context.newPage();
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:projectLiveHTML(project,cid)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async({mode,expectedBoxes})=>{
   const {createChatGPTAdapter,createSurfaceDiscovery,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=projectRegression;
   const policy=createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}});
   const panel=document.querySelector('#project-panel'),tab=document.querySelector('#chats-tab');
   const nodes={main:document.querySelector('#project'),composer:document.querySelector('form'),header:document.querySelector('header'),hitRoot:document.querySelector('[data-app-shell-main-content-layout]'),panel,slot:document.querySelector('[data-app-shell-main-titlebar]'),tabs:document.querySelector('#project-tabs')};
   const boxes=Object.fromEntries(Object.entries(nodes).map(([key,n])=>{const r=n.getBoundingClientRect();return [key,[r.x,r.y,r.width,r.height]];}));
   const geometryMatches=Object.entries(expectedBoxes).every(([key,b])=>b.every((n,i)=>Math.abs(boxes[key][i]-n)<0.001));
   let forbiddenReads=0,surface;
   for(const node of [panel,...panel.querySelectorAll('a,a>div,a>div>div:last-child')])for(const key of ['textContent','innerText'])Object.defineProperty(node,key,{configurable:true,get(){forbiddenReads++;throw Error('private-preview-read');}});
   const binding={documentToken:'project-fixture',producerToken:'project-fixture',browserDocumentId:'project-fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+60000).toISOString()};
   const adapter=createChatGPTAdapter({document,profile,urlPolicy:policy,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const original=adapter.inspect(),discovery=createSurfaceDiscovery({document,profile,urlPolicy:policy,binding});
   discovery.scan();
   if(mode==='missing-controls')tab.removeAttribute('aria-controls');
   if(mode==='missing-label')panel.removeAttribute('aria-labelledby');
   if(mode==='wrong-controls'||mode==='changed-relation')tab.setAttribute('aria-controls','other-panel');
   if(mode==='wrong-label')panel.setAttribute('aria-labelledby','other-tab');
   if(mode==='duplicate-panel-id'||mode==='duplicate-tab-id'){const other=document.createElement('div');other.id=mode==='duplicate-panel-id'?panel.id:tab.id;other.hidden=true;document.body.append(other);}
   if(mode==='stage-structure')nodes.tabs.remove();
   if(mode==='stage-geometry')document.querySelector('#project-scroll').style.transform='scale(.99)';
   if(mode==='stage-header')nodes.header.remove();
   if(mode==='stage-identity')nodes.tabs.replaceWith(nodes.tabs.cloneNode(true));
   let check;
   if(mode==='flow-continuity'){
    surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
    const editor=document.querySelector('textarea'),draft=editor.value,native=editor.parentElement;
    const mount=await surface.mount({binding},original),frames=surface.frames(mount).map(x=>x.frame);
    const shown=surface.showWorkspace(mount),structure=adapter.inspectStructure(original).ok;
    surface.showReading(mount);const restored=adapter.inspect().ok&&editor.isConnected&&editor.parentElement===native&&editor.value===draft&&frames.every(n=>n.isConnected&&!n.hasAttribute('srcdoc'));
    check={ok:original.ok&&shown&&structure&&restored,shown,structure,restored};surface.dispose(mount);
   }else if(mode.startsWith('stage-')){
    const next=mode==='stage-identity'?adapter.inspectStructure(original):adapter.inspect();
    const expected={
     'stage-structure':{reason:'unsafe-native-project-layout',stage:'tabs-panel'},
     'stage-geometry':{reason:'unsafe-native-geometry',stage:'geometry-effects'},
     'stage-header':{reason:'missing-or-ambiguous-native-boundary',stage:null,key:'header'},
     'stage-identity':{reason:'region-identity-changed',stage:null},
    }[mode];
    check={ok:next.ok===false&&next.reason===expected.reason&&(next.projectStage??null)===expected.stage&&(next.boundaryKey??null)===(expected.key??null),reason:next.reason,stage:next.projectStage??null,key:next.boundaryKey??null};
   }else{
    const next=discovery.scan(),positive=next.membershipClaims.filter(c=>c.asserted==='PROJECT').length,none=next.membershipClaims.some(c=>c.asserted==='NONE');
    check={ok:positive===(mode==='positive'?2:0)&&!none,positive,none};
   }
   discovery.stop();await adapter.stop();return {...check,geometryMatches,forbiddenReads};
  },{mode,expectedBoxes:projectLiveEvidence.boxes}).catch(error=>({ok:false,error:error.message}));
  report.checks.push({mode,...result,ok:result.ok&&result.geometryMatches&&result.forbiddenReads===0});await context.close();
 }
 report.status=report.checks.every(x=>x.ok)?'OFFLINE_PASS':'FAIL';
}finally{
 await browser.close();if(process.env.FREE_PROJECT_REPORT)await writeFile(process.env.FREE_PROJECT_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
assert.equal(report.status,'OFFLINE_PASS',JSON.stringify(report.checks.filter(x=>!x.ok)));
