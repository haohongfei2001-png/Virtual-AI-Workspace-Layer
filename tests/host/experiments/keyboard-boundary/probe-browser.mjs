/** Static mechanism experiment only; not formal Host S or UI06 acceptance. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../../../b1/tooling/node_modules/playwright/index.mjs';
const source=await readFile('src/navigation/mount-surface.mjs','utf8'),dir=await mkdtemp('/private/tmp/vaiwl-keyboard-boundary-'),pkg=join(dir,'package');await mkdir(pkg);
await writeFile(join(pkg,'manifest.json'),JSON.stringify({manifest_version:3,name:'Static keyboard boundary mechanism probe',version:'0.0.1',web_accessible_resources:[{resources:['workspace.html','sidebar.html'],matches:['http://127.0.0.1/*']}],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));
for(const role of ['workspace','sidebar'])await writeFile(join(pkg,role+'.html'),'<!doctype html><title>'+role+'</title><button id="first">First</button><button id="last">Last</button>');
const html=`<!doctype html><style>header{height:50px}#history{position:absolute;left:0;top:60px;width:200px;height:300px}#reading{position:absolute;left:210px;top:60px;width:500px;height:300px}#composer{position:absolute;left:210px;top:380px;width:500px;height:90px}</style><header><button id="native-header">Header</button></header><aside id="history"><a href="#history">History</a></aside><main id="reading">Native reading</main><form id="composer"><textarea id="original">STATIC_DRAFT</textarea></form><script type="module">
import {createMountSurface} from '/mount.mjs';
const params=new URLSearchParams(location.search),id=params.get('id');
const reading=document.querySelector('#reading'),header=document.querySelector('header'),composer=document.querySelector('#composer'),history=document.querySelector('#history');
globalThis.originals={document,reading,header,composer,history,editor:document.querySelector('textarea')};
globalThis.surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://'+id+'/'+role+'.html'});
globalThis.handle=await surface.mount({binding:{documentToken:'static-only'}},{ok:true,viewMask:'declarative-css',regionEpoch:1,reading,header,composer,historyMaskRoots:[history],protectedRegions:[],readingRect:{x:210,y:60,width:500,height:300},sidebarRect:{x:0,y:60,width:200,height:300}});
if(params.get('tail')==='1'){const input=document.createElement('input');input.id='tail-native';input.style.cssText='position:absolute;top:500px';document.body.append(input);}
surface.showWorkspace(handle);globalThis.ready=true;
</script>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/mount.mjs'?'text/javascript':'text/html');res.end(req.url==='/mount.mjs'?source:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const report={scope:'STATIC_MOUNT_KEYBOARD_MECHANISM_ONLY_NOT_HOST_S',sourceSHA256:createHash('sha256').update(source).digest('hex'),results:[],errors:[]};let context;
function installProbe(){
 const kind=n=>n===document.body?'body':n?.tagName==='IFRAME'?(n.title==='工作空间'?'workspace':'sidebar'):n?.id==='original'?'composer':n?.id==='tail-native'?'tail-native':n?.hasAttribute?.('popovertarget')?'owned-close':n?.id==='first'?'first':n?.id==='last'?'last':n?.id==='native-header'?'native-header':n?.tagName==='A'?'history':'other';
 let events=[];for(const type of ['keydown','keyup','focusin','focusout'])document.addEventListener(type,e=>{if(type.startsWith('key')&&e.key!=='Tab')return;events.push({type,trusted:e.isTrusted,target:kind(e.target),shift:!!e.shiftKey});},true);
 globalThis.probe={reset(){events=[];},read(){return {focus:kind(document.activeElement),hasFocus:document.hasFocus(),events:[...events]};}};
}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:pkg});report.browser=context.browser().version();
 for(const tail of [false,true]){
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/?id='+id+'&tail='+Number(tail));await page.waitForFunction(()=>globalThis.ready===true);
  const workspace=page.frameLocator('iframe[title="工作空间"]'),sidebar=page.frameLocator('iframe[title="导航"]');await workspace.locator('#first').waitFor();await sidebar.locator('#first').waitFor();
  const frames=['workspace','sidebar'].map(role=>page.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`));assert(frames.every(Boolean));const documents=[page,...frames];for(const f of documents)await f.evaluate(installProbe);
  await workspace.locator('#first').click();const result={tailNative:tail,keys:[]};report.results.push(result);
  for(let i=0;i<24;i++){
   for(const f of documents)await f.evaluate(()=>probe.reset());await page.keyboard.press('Tab');const observations=[];
   for(const f of documents)observations.push(await f.evaluate(()=>probe.read()));result.keys.push(observations);
   if(observations[0].focus==='composer'||observations[0].focus==='tail-native')break;
  }
  result.reachedComposer=result.keys.some(k=>k[0].focus==='composer');result.reachedTail=result.keys.some(k=>k[0].focus==='tail-native');
  for(const key of result.keys){const downs=key.flatMap(d=>d.events).filter(e=>e.type==='keydown');assert.equal(downs.length,1);assert.equal(downs[0].trusted,true);}
  // Real declarative close controls remain usable; verify restoration separately.
  await page.evaluate(()=>surface.showWorkspace(handle));await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.getByRole('button',{name:'显示原生列表',exact:true}).click();await page.locator('#original').click();
  result.continuity=await page.evaluate(()=>({document:originals.document===document,editor:originals.editor===document.querySelector('#original'),draft:originals.editor.value==='STATIC_DRAFT',nativeNodes:['reading','header','composer','history'].every(k=>originals[k].isConnected),closed:document.querySelectorAll('[data-va-owned]:popover-open').length===0,masksRestored:[originals.reading,originals.history].every(n=>getComputedStyle(n).visibility==='visible'),composerFocused:document.activeElement===originals.editor}));assert(Object.values(result.continuity).every(Boolean));await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status='MECHANISM_OBSERVED';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}finally{await context?.close();await new Promise(r=>server.close(r));assert.equal(await readFile('src/navigation/mount-surface.mjs','utf8'),source);await writeFile(process.argv[2]??'/private/tmp/free-keyboard-boundary-probe.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results.map(({keys,...r})=>({...r,keyCount:keys.length}))}));
