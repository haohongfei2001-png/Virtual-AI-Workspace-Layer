/** EXPERIMENT ONLY. Requires separately authorized, working isolated Chromium. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../../../b1/tooling/node_modules/playwright/index.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-native-visibility-probe.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=[new URL('./probe.mjs',import.meta.url),new URL(import.meta.url)];
const sourceHashes=await Promise.all(sources.map(async p=>hash(await readFile(p))));
const report={sourceHashes,status:'NOT_RUN',evidence:'ISOLATED_EXPERIMENT_NOT_PRODUCT_ACCEPTANCE',results:[],paintAbsence:'NOT_PROVEN',focusAXPopover:'NOT_RUN'};
let context;
try{
 context=await chromium.launchPersistentContext(join(await mkdtemp(join(tmpdir(),'vaiwl-mask-experiment-')),'profile'),{executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',headless:true});
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage(),cdp=await context.newCDPSession(page);
 await page.setContent(`<!doctype html><style>
 #owned{position:fixed;left:400px;top:10px}#owned:popover-open{display:block}
 body:has(#owned:popover-open) #native{visibility:hidden;interactivity:inert;}
 .native-hidden{visibility:hidden}a{display:block}
 </style><div id="native"><a href="#fresh">Fresh native</a><a class="native-hidden" href="#stale">Stale native</a><section class="native-hidden"><a href="#nested">Inherited stale</a></section></div><section id="owned" popover="manual"><button>Owned control</button></section>`);
 await page.evaluate(()=>{document.querySelector('#owned').showPopover();document.querySelector('#owned button').focus();});
 const beforeAX=await cdp.send('Accessibility.getFullAXTree');
 const source=await readFile(new URL('./probe.mjs',import.meta.url),'utf8');
 report.results=await page.evaluate(async source=>{
  const {probeNativeVisibility}=await import('data:text/javascript,'+encodeURIComponent(source));
  const owned=document.querySelector('#owned'),native=document.querySelector('#native'),nodes=[...native.querySelectorAll('a')],rules=[...document.styleSheets[0].cssRules].filter(r=>r.selectorText?.includes('body:has'));
  const check=(v,m)=>{if(!v)throw Error(m);},before=rules.map(r=>r.cssText),originalDOM=native.outerHTML,focus=document.activeElement;
  let mutationCount=0,toggleCount=0,focusCount=0;const observer=new MutationObserver(rows=>mutationCount+=rows.length);observer.observe(document.documentElement,{subtree:true,attributes:true,childList:true,characterData:true});owned.addEventListener('beforetoggle',()=>toggleCount++);document.addEventListener('focusin',()=>focusCount++);
  check(nodes.every(n=>getComputedStyle(n).visibility==='hidden'),'missing CSS inheritance');
  const values=nodes.map(n=>probeNativeVisibility(n,{rules,getComputedStyle:node=>{check(getComputedStyle(native).interactivity==='inert','inert removed');node.focus();check(document.activeElement===focus,'probe changed focus');return getComputedStyle(node);}}));
  check(JSON.stringify(values)==='[true,false,false]','native/owned disambiguation failed');
  try{probeNativeVisibility(nodes[0],{rules,getComputedStyle:()=>{throw Error('injected');}});}catch(error){check(error.message==='injected','unexpected exception');}
  check(JSON.stringify(rules.map(r=>r.cssText))===JSON.stringify(before),'CSS restoration differs');
  await Promise.resolve();check(mutationCount===0&&toggleCount===0&&focusCount===0,'probe emitted DOM/focus/popover activity');
  for(let i=0;i<3;i++)await new Promise(resolve=>requestAnimationFrame(()=>{check(nodes.every(n=>getComputedStyle(n).visibility==='hidden'),'visible at animation frame');resolve();}));
  check(native.outerHTML===originalDOM&&owned.matches(':popover-open')&&document.activeElement===focus,'native DOM/popover/focus changed');observer.disconnect();
  return [{name:'native-owned-inherited-visibility',values,status:'PASS'},{name:'inert-focus-popover-dom-exception-restoration',status:'PASS'},{name:'three-restored-animation-frames',status:'PASS',noIntermediatePaintClaim:false}];
 },source);
 const afterAX=await cdp.send('Accessibility.getFullAXTree');
 const relevant=x=>x.nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value}));assert.deepEqual(relevant(afterAX),relevant(beforeAX));
 report.focusAXPopover='BEFORE_AFTER_PASS_NOT_TRANSIENT_PROOF';report.browserVersion=context.browser().version();report.status='PASS_MECHANISM_ONLY';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}finally{await context?.close();report.sourceChangedDuringRun=(await Promise.all(sources.map(async(p,i)=>hash(await readFile(p))!==sourceHashes[i]))).some(Boolean);if(report.sourceChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
