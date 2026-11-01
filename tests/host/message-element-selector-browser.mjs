import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createCurrentBodyDiscovery,CHATGPT_SELECTION_CURRENT_BODY} from './src/host/current-body-discovery.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'bodyModule'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 await page.setContent('<main><section data-chatgpt-conversation-selection-target><div data-chatgpt-selection-conversation-id="C" data-chatgpt-selection-message-id="m1">fixture</div><div data-chatgpt-selection-conversation-id="C" data-chatgpt-selection-message-id="m2">fixture</div></section></main>');
 await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(()=>{
  const d=bodyModule.createCurrentBodyDiscovery({document,urlPolicy:{parse:()=>({kind:'conversation',conversationId:'C'})},profile:{id:'native-message-elements',revision:1,currentBody:bodyModule.CHATGPT_SELECTION_CURRENT_BODY}});
  const node=document.querySelector('[data-chatgpt-selection-message-id="m2"]'),out=[d.scan().association];
  node.removeAttribute('data-chatgpt-selection-conversation-id');out.push(d.scan().association);
  node.setAttribute('data-chatgpt-selection-conversation-id','C');node.removeAttribute('data-chatgpt-selection-message-id');out.push(d.scan().association);
  node.setAttribute('data-chatgpt-selection-message-id','m2');out.push(d.scan().association);d.stop();return out;
 });
 assert.deepEqual(result,['explicit-body-id','unproven','unproven','explicit-body-id']);
 console.log('PASS real DOM partial message identity rejects association; synthetic DOM only, not MV3 or live acceptance');
}finally{await browser.close();}
