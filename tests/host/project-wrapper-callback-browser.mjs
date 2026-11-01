// Anonymous real-DOM oracle. The old and new implementations run against the
// same explicit fixture; no live Project structure is claimed or reconstructed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url)),esbuild=require('esbuild');
const entry="export {captureNativeBaseline} from './src/host/document-flow-layout.mjs';export {snapshotProjectWrapperRefusal,validProjectWrapperReport} from './src/host/project-wrapper-diagnostic.mjs';";
const build=async(old=false)=>(await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:old?'oldFlow':'newFlow',plugins:old?[{name:'fixed-parent',setup(b){b.onLoad({filter:/src\/host\/document-flow-layout\.mjs$/},()=>({contents:execFileSync('git',['show','1903b00f774b4fd7f3d15b3669878c32e2c7a9c8:src/host/document-flow-layout.mjs'],{encoding:'utf8'}),loader:'js'}));}}]:[]})).outputFiles[0].text;
const [oldSource,newSource]=await Promise.all([build(true),build()]);
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']});
let report;
try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<!doctype html><style>main{width:800px;height:700px;display:flex;flex-direction:column}header,section,form,[role=tablist]{height:50px} .pseudo::before{content:"PRIVATE_GENERATED"}</style><main></main>');
 await page.addScriptTag({content:oldSource});await page.addScriptTag({content:newSource});
 report=await page.evaluate(()=>{
  const results=[];
  for(const depth of [9,16,24,40])for(const detail of ['wrapper-seam','wrapper-visibility','wrapper-effect','wrapper-pseudo']){
   const root=document.querySelector('main');root.replaceChildren();const header=document.createElement('header'),tabs=document.createElement('div'),composer=document.createElement('form'),reading=document.createElement('section');tabs.setAttribute('role','tablist');root.append(header,tabs,composer);
   let parent=root,bad;for(let i=0;i<depth;i++){bad=document.createElement('div');bad.style.display='contents';parent.append(bad);parent=bad;}bad.append(reading);
   bad.style.display='flex';if(detail==='wrapper-visibility')bad.style.opacity='0';if(detail==='wrapper-effect')bad.style.transform='translateX(1px)';if(detail==='wrapper-pseudo')bad.className='pseudo';
   const shells=detail==='wrapper-seam'?[]:[bad],inspection={ok:true,reading,composer,header,readingViewport:root,protectedRegions:[header,tabs,composer],flowSeam:{version:'native-flow-seam-v1',roots:[root],shells}};
   const before=root.outerHTML;const observer=new MutationObserver(()=>{});observer.observe(root,{subtree:true,attributes:true,childList:true,characterData:true});
   let oldReason,newReason,oldContext,oldReport,contextMatched=false,savedContext,anonymous,local;
   const oldResult=oldFlow.captureNativeBaseline({document,inspection,onRefused:r=>{oldReason=r;},onDiagnostic:(report,context)=>{oldContext=context;oldReport=report;}});
   const newResult=newFlow.captureNativeBaseline({document,inspection,onRefused:r=>{newReason=r;},onDiagnostic:(report,context)=>{savedContext=context;anonymous=report;contextMatched=context.document===document&&context.inspection===inspection&&context.root===root&&context.node===bad&&context.flowSeamShells===shells&&context.detail===detail&&context.phase==='walk';local=newFlow.snapshotProjectWrapperRefusal(report,context);}});
   const variants=[];for(const consumer of [()=>{throw Error('PRIVATE');},(_,context)=>{Object.freeze(context);},(_,context)=>{Object.defineProperty(context,'node',{set(){throw Error('PRIVATE');}});},()=>{}]){
    let reason;const plan=newFlow.captureNativeBaseline({document,inspection,onRefused:r=>{reason=r;},onDiagnostic:consumer});variants.push({reason,refused:plan===null});
   }
   results.push({depth,detail,oldMissingContext:oldContext===undefined,oldReason,newReason,oldDetail:oldReport.detail,oldPhase:oldReport.phase,oldVisited:oldReport.visited,newVisited:anonymous.visited,refused:oldResult===null&&newResult===null,contextMatched,revoked:savedContext.document===null&&savedContext.inspection===null&&savedContext.node===null&&savedContext.root===null&&savedContext.flowSeamShells===null,coverage:anonymous.coverage,rows:anonymous.rows.length,localValid:newFlow.validProjectWrapperReport(local),localState:local.state,localLimit:local.limit,localNodes:local.nodes.length,privateLeak:JSON.stringify(local).includes('PRIVATE'),mutations:observer.takeRecords().length,unchanged:root.outerHTML===before,variants});observer.disconnect();
  }
  // Original 128-node capacity stays authoritative. The scoped consumer must
  // not run the old path snapshot for this non-wrapper first decision.
  const root=document.querySelector('main');root.replaceChildren();const header=document.createElement('header'),tabs=document.createElement('div'),composer=document.createElement('form'),reading=document.createElement('section');tabs.setAttribute('role','tablist');root.append(header,tabs,composer);let parent=root;
  for(let i=0;i<140;i++){const n=document.createElement('div');n.style.display='contents';parent.append(n);parent=n;}parent.append(reading);
  const inspection={ok:true,reading,composer,header,readingViewport:root,protectedRegions:[header,tabs,composer],flowSeam:{version:'native-flow-seam-v1',roots:[root],shells:[]}};
  let reads=0;for(const node of [root,...root.querySelectorAll('*')]){const original=node.getBoundingClientRect.bind(node);node.getBoundingClientRect=()=>{reads++;return original();};}
  let oldReason,newReason,scopedReport,scopedContext,scopedLocal;
  oldFlow.captureNativeBaseline({document,inspection,onRefused:r=>{oldReason=r;}});const oldReads=reads;reads=0;
  newFlow.captureNativeBaseline({document,inspection,onRefused:r=>{newReason=r;},diagnosticScope:'project-wrapper',onDiagnostic:(r,c)=>{scopedReport=r;scopedContext=c.reason;scopedLocal=newFlow.snapshotProjectWrapperRefusal(r,c).state;}});
  const newReads=reads;let oldCapacity,newCapacity;
  oldFlow.captureNativeBaseline({document,inspection,onDiagnostic:r=>{oldCapacity={reason:r.reason,detail:r.detail,visited:r.visited};}});
  newFlow.captureNativeBaseline({document,inspection,onDiagnostic:r=>{newCapacity={reason:r.reason,detail:r.detail,visited:r.visited};}});
  return {schema:'project-wrapper-callback-browser-v1',realChatGPT:'NOT_RUN',results,capacity:{oldReason,newReason,oldReads,newReads,scopedReport,scopedContext,scopedLocal,oldCapacity,newCapacity}};
 });
 await writeFile(process.argv[2]??'/tmp/vaiwl-wrapper-callback-browser.json',JSON.stringify(report,null,2)+'\n');
 for(const row of report.results){assert(row.oldMissingContext,'RED: original implementation lacks exact refusal context');assert(row.refused&&row.contextMatched&&row.revoked&&row.localValid&&row.unchanged);assert.equal(row.oldReason,'native-flow-wrapper-paint');assert.equal(row.newReason,row.oldReason);assert.equal(row.oldDetail,row.detail);assert.equal(row.oldPhase,'walk');assert.equal(row.oldVisited,row.newVisited);assert.equal(row.mutations,0);assert.equal(row.privateLeak,false);assert(row.rows<=24);assert(row.localNodes<=3);if(row.localLimit!=='time')assert.equal(row.localNodes,3);if(row.depth>16){assert.equal(row.coverage,'partial');assert.equal(row.localState,'PARTIAL');}for(const v of row.variants){assert.equal(v.reason,row.oldReason);assert(v.refused);}}
 assert.equal(report.capacity.oldReason,'native-flow-capacity');assert.equal(report.capacity.newReason,report.capacity.oldReason);assert.equal(report.capacity.oldReads,report.capacity.newReads);assert.equal(report.capacity.scopedReport,null);assert.equal(report.capacity.scopedContext,'native-flow-capacity');assert.equal(report.capacity.scopedLocal,'NO_MATCH');assert.deepEqual(report.capacity.newCapacity,report.capacity.oldCapacity);assert.equal(report.capacity.newCapacity.visited,129);assert.equal(report.capacity.newCapacity.detail,'node-capacity');
 report.status='PASS';report.redMissingContext=16;report.greenExactContext=16;report.callbackIsolation=64;report.browser=browser.version();
 const path=process.argv[2]??'/tmp/vaiwl-wrapper-callback-browser.json';await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,red:16,green:16,callbackIsolation:64,path}));
}finally{await browser.close();}
