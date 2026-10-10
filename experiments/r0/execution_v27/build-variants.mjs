/** R0-only controlled variants. Original PR #3 sources remain byte-identical. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const source=resolve(dirname(fileURLToPath(import.meta.url)),'../mv3');
const out=resolve(process.argv[2]||'');
if(!process.argv[2] || !out.startsWith('/tmp/vaiwl-r0-')) throw new Error('Dedicated /tmp/vaiwl-r0-* output required');
mkdirSync(out,{recursive:true});if(readdirSync(out).length)throw new Error('Output must be empty');
const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
manifest.name='VAIWL R0 route-invalidation ONLY';manifest.version='0.0.2';
manifest.description='Synthetic loopback only. Not a ChatGPT adapter or account attestation.';
manifest.permissions=['webNavigation'];
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
writeFileSync(join(out,'protocol.mjs'),readFileSync(join(source,'protocol.mjs')));
const worker=readFileSync(join(source,'worker.mjs'),'utf8')+`
// Chrome-provided route events, restricted to the fixture origin/path. No private history API.
chrome.webNavigation.onHistoryStateUpdated.addListener(details => {
  if (details.frameId !== 0 || !details.documentId || !fixtureURL(details.url)) return;
  chrome.tabs.sendMessage(details.tabId, {type:'R0_ROUTE_INVALIDATE'},
    {documentId:details.documentId}).catch(() => {});
}, {url:[{hostEquals:'127.0.0.1',pathPrefix:'/r0-mv3-fixture/'}]});
`;
writeFileSync(join(out,'worker.mjs'),worker.replace("import { createBroker }", "import { createBroker, fixtureURL }"));
let entry=readFileSync(join(source,'content-entry.mjs'),'utf8');
const marker='  // These handlers only drive';
if(entry.split(marker).length!==2)throw new Error('Unexpected original content entry');
entry=entry.replace(marker,`  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === 'R0_ROUTE_INVALIDATE') client.stop();
  });
`+marker);
// A single nonsensitive hook in the already validated empty slot. This is not a UI proposal.
entry=entry.replace('shadow.append(label);',`shadow.append(label);
      const back = document.createElement('button');
      back.textContent = '▦'; back.setAttribute('aria-label','R0 workspace return');
      back.addEventListener('click', () => { mark.dataset.returned = 'true'; });
      shadow.append(back);`);
const body=['protocol.mjs','client.mjs'].map(n=>readFileSync(join(source,n),'utf8')).concat(entry)
 .map(t=>t.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
writeFileSync(join(out,'content.js'),'(() => {\n"use strict";\n'+body+'\n})();\n');
console.log(JSON.stringify({variant:'route-invalidation-and-single-owned-hook',output:out,originalSourcesChanged:false}));
