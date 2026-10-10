import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const dest=resolve(process.argv[2]||'');
if(!process.argv[2]||!dest.startsWith('/tmp/vaiwl-b1-'))throw Error('B1 build accepts only /tmp/vaiwl-b1-* destination');
const root=resolve(import.meta.dirname,'../../..');
mkdirSync(dest,{recursive:true});
for(const name of ['manifest.json','worker.mjs','client.js']){
  cpSync(join(root,'experiments/b1/fixture',name),join(dest,name));
}
for(const name of ['identity.mjs','scope-repository.mjs','document-binding-broker.mjs']){
  cpSync(join(root,'src/b1',name),join(dest,name));
}
const manifest=JSON.parse(readFileSync(join(dest,'manifest.json'),'utf8'));
if(manifest.host_permissions.some(x=>x.includes('chatgpt.com')||x.includes('all_urls')))throw Error('Live host permission forbidden at B1');
console.log(JSON.stringify({built:dest,manifest:manifest.name,match:manifest.content_scripts[0].matches}));
