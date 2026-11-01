import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
const dest=resolve(process.argv[2]||'');
if(!process.argv[2]||!dest.startsWith('/tmp/vaiwl-b1-'))throw Error('B1 build accepts only /tmp/vaiwl-b1-* destination');
const root=resolve(import.meta.dirname,'../../..');
mkdirSync(dest,{recursive:true});
for(const name of ['manifest.json','worker.mjs','client.js']){
  cpSync(join(root,'experiments/b1/fixture',name),join(dest,name));
}
// Preserve the old fixture entry imports while shipping the actual shared graph.
// B1 now depends on the SAME database migration and command schema as B2/B3.
for(const path of ['src/b1/identity.mjs','src/b1/scope-repository.mjs','src/b1/document-binding-broker.mjs','src/data/known-anchor-key.mjs','src/data/free-policy-initialization.mjs','src/data/schema.mjs','src/data/state.mjs','src/data/preferences.mjs','src/data/free-time-policy.mjs','src/data/hash.mjs','src/navigation/projection.mjs']){
  mkdirSync(dirname(join(dest,path)),{recursive:true});cpSync(join(root,path),join(dest,path));
}
for(const name of ['identity.mjs','scope-repository.mjs','document-binding-broker.mjs']){
  writeFileSync(join(dest,name),`export * from './src/b1/${name}';\n`);
}
const manifest=JSON.parse(readFileSync(join(dest,'manifest.json'),'utf8'));
if(manifest.host_permissions.some(x=>x.includes('chatgpt.com')||x.includes('all_urls')))throw Error('Live host permission forbidden at B1');
console.log(JSON.stringify({built:dest,manifest:manifest.name,match:manifest.content_scripts[0].matches}));
