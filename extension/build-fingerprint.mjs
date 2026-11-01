import {readFileSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
export const HOST_ENTRIES=['extension/worker.mjs','extension/content-entry.mjs','extension/workspace.mjs','extension/sidebar.mjs','extension/status.mjs','extension/temporary-navigation.mjs','extension/temporary-content-entry.mjs'];
const imports=text=>[...text.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
export function browserLocalFingerprint(modules,bootstrap){
 const inputs=new Map(modules);inputs.set('extension/content-bootstrap.js',bootstrap);
 return createHash('sha256').update(JSON.stringify([...inputs].sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
}
// Reconstruct the source graph from the supplied package. The original worker
// entry is retained because the executable path contains its classic bundle.
export function packagedBrowserLocalFingerprint(root){
 const modules=new Map();
 function visit(path){
  if(modules.has(path))return;
  if(!path.startsWith('src/')&&!path.startsWith('extension/'))throw Error('invalid-host-build-dependency');
  let source=readFileSync(resolve(root,path==='extension/worker.mjs'?'extension/worker-source.mjs':path),'utf8');
  if(path==='extension/runtime-build.mjs'){
   const marker=/export const HOST_BUILD="([a-f0-9]{64})";/g,matches=[...source.matchAll(marker)];
   if(matches.length!==1)throw Error('invalid-host-build-fingerprint-module');
   source=source.replace(marker,"export const HOST_BUILD=/* build-runtime-fingerprint */ 'source';");
  }
  modules.set(path,source);
  for(const dependency of imports(source)){
   if(!dependency.startsWith('.'))throw Error('nonlocal-host-build-import');
   visit(relative(root,resolve(root,dirname(path),dependency)).split(sep).join('/'));
  }
 }
 HOST_ENTRIES.forEach(visit);
 return browserLocalFingerprint(modules,readFileSync(resolve(root,'extension/content-bootstrap.js'),'utf8'));
}
