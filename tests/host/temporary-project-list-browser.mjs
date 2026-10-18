import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url)),baseline=process.env.FREE_TEMPORARY_PROJECT_BASELINE;
const plugins=baseline?[{name:'old-temporary-reader',setup(build){build.onLoad({filter:/src\/host\/temporary-native-navigation\.mjs$/},()=>({contents:execFileSync('git',['show',baseline+':src/host/temporary-native-navigation.mjs'],{encoding:'utf8'}),loader:'js'}));}}]:[];
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {installTemporaryNativeNavigation} from './src/host/temporary-native-navigation.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';",resolveDir:process.cwd()},plugins,bundle:true,write:false,format:'iife',globalName:'temporaryModule'});
const project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',cid='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',url='https://chatgpt.com/g/'+project+'/project';
const browser=await chromium.launch({headless:true}),results=[],started=performance.now();
try{
 for(const mode of ['visible','duplicate','conflict','hidden-root','ambiguous-root','wrong-route','editable-title','hidden-title','title-too-long','foreign-link','project-link-in-list','late-root','remove-root','replace-root','route-with-old-list','hashchange','budget']){
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,cid)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async({mode,cid,other})=>{
   const {installTemporaryNativeNavigation,CHATGPT_OBSERVED_PROFILE:profile}=temporaryModule;
   let listener,forbiddenReads=0;const sent=[];
   const runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,sendMessage:m=>{sent.push(m);return Promise.resolve();},onMessage:{addListener:f=>listener=f,removeListener:()=>listener=null}};
   const panel=document.querySelector('#project-panel'),main=document.querySelector('#project'),nav=document.querySelector('nav'),second=panel.querySelectorAll('a')[1],leaf=second.firstElementChild.firstElementChild;
   const guard=node=>{for(const key of ['textContent','innerText'])Object.defineProperty(node,key,{configurable:true,get(){forbiddenReads++;throw Error('private-container-read')}});};
   function guardList(root){for(const a of root.querySelectorAll('a')){guard(a);guard(a.firstElementChild);guard(a.firstElementChild.lastElementChild);}guard(root);}
   guardList(panel);guard(main.querySelector('h1'));guard(main.querySelector('h1 button'));
   // This chat has no sidebar entry. No heading or list preview is needed.
   if(mode==='duplicate'||mode==='conflict'){const a=document.createElement('a');a.href='/c/'+other;a.textContent=mode==='conflict'?'Different title':'Native B';nav.append(a);}
   if(mode==='hidden-root'||mode==='late-root')main.hidden=true;
   if(mode==='ambiguous-root')main.after(main.cloneNode(true));
   if(mode==='wrong-route')history.pushState({},'', '/c/'+cid);
   if(mode==='editable-title'){leaf.contentEditable='true';guard(leaf);}
   if(mode==='hidden-title'){leaf.hidden=true;guard(leaf);}
   if(mode==='title-too-long')leaf.replaceChildren('x'.repeat(201));
   if(mode==='foreign-link')second.href='https://example.invalid/c/'+other;
   if(mode==='project-link-in-list')second.href=location.href;
   if(mode==='budget'){
    const ol=panel.querySelector('ol');for(let i=0;i<260;i++){const li=document.createElement('li');li.innerHTML='<a href="/c/00000000-0000-4000-8000-'+String(i).padStart(12,'0')+'"><div><div>Bounded '+i+'</div><div>DO NOT READ</div></div></a>';ol.append(li);}guardList(panel);
   }
   const stop=installTemporaryNativeNavigation({document,runtime,origin:location.origin,profile});
   const read=()=>{let value;listener({v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},{id:runtime.id,url:runtime.getURL('status.html')},v=>value=v);return value;};
   const first=read();let expected=['hidden-root','ambiguous-root','wrong-route','editable-title','hidden-title','title-too-long','foreign-link','project-link-in-list','late-root','conflict'].includes(mode)?1:2;if(mode==='budget')expected=256;
   let eventOK=true;
   if(['late-root','remove-root','replace-root','route-with-old-list','hashchange'].includes(mode)){
    if(mode==='late-root')main.hidden=false;
    if(mode==='remove-root')main.remove();
    if(mode==='replace-root')main.replaceWith(main.cloneNode(true));
    if(mode==='route-with-old-list'){history.pushState({},'', '/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/project');document.body.dataset.testRoute='changed';}
    if(mode==='hashchange')dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise(r=>setTimeout(r,0));eventOK=sent.length===1;
    document.body.dataset.testAgain='changed';await new Promise(r=>setTimeout(r,0));eventOK&&=sent.length===1;
    const fresh=read();eventOK&&=fresh.items.length===(mode==='remove-root'?1:2);stop();eventOK&&=sent.length===2;
   }else stop();
   const expectedKeys='href,kind,title',newChat=first.items.find(i=>i.href.endsWith('/c/'+other));
   return {mode,count:first.items.length,expected,forbiddenReads,eventOK,plainRows:first.items.every(i=>Object.keys(i).sort().join(',')===expectedKeys&&i.kind==='conversation'),titleOnly:!newChat||newChat.title==='Native B',projectLinkFirst:first.items[0]?.href.includes('/g/')||['hidden-root','ambiguous-root','wrong-route','late-root'].includes(mode),conflict:mode!=='conflict'||!newChat,partial:mode==='budget'||mode==='conflict'?first.partial:true,bytes:first.items.reduce((n,r)=>n+new TextEncoder().encode(JSON.stringify(r)).length,0),noLeaks:listener===null};
  },{mode,cid,other});
  result.passed=result.count===result.expected&&result.forbiddenReads===0&&result.eventOK&&result.plainRows&&result.titleOnly&&result.projectLinkFirst&&result.conflict&&result.partial&&result.bytes<=49152&&result.noLeaks;
  results.push(result);await page.close();
 }
 console.log(JSON.stringify({status:results.every(r=>r.passed)?'PASS_WEB_MECHANISM_ONLY':'FAIL',baseline:baseline??null,durationMs:performance.now()-started,results}));assert(results.every(r=>r.passed));
}finally{await browser.close();}
