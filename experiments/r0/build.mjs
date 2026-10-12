import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),out=resolve(process.argv[2]??'');
if(!process.argv[2]||existsSync(out)||out===root||out.startsWith(root+'/src/')||out.startsWith(root+'/simulator/'))throw Error('NEW_DEDICATED_BUILD_REQUIRED');
mkdirSync(out,{recursive:true});const files=new Set();
function copy(path){if(files.has(path))return;if(!path.startsWith('src/')&&!path.startsWith('experiments/r0/'))throw Error('outside-experiment-graph');files.add(path);const text=readFileSync(resolve(root,path),'utf8');mkdirSync(dirname(resolve(out,path)),{recursive:true});writeFileSync(resolve(out,path),text);for(const m of text.matchAll(/import\s*\{[^}]+\}\s*from\s*['"]([^'"]+)['"]/g))copy(relative(root,resolve(root,dirname(path),m[1])));}
copy('experiments/r0/worker.mjs');copy('experiments/r0/content.js');
const manifest={manifest_version:3,name:'VAIWL R0 — read-only live probe',version:'0.0.1',permissions:['webNavigation','scripting'],host_permissions:['https://chatgpt.com/*'],background:{service_worker:'experiments/r0/worker.mjs',type:'module'},action:{default_title:'VAIWL R0 experiment — remove in Chrome extensions'},content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'"}};
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');files.add('manifest.json');const hashes=Object.fromEntries([...files].map(p=>[p,createHash('sha256').update(readFileSync(resolve(out,p))).digest('hex')]));writeFileSync(resolve(out,'SHA256.json'),JSON.stringify(hashes,null,2)+'\n');console.log(JSON.stringify({built:true,automaticContentScripts:false,scopeResolver:'always-unverified',nativeWriter:false,hashes}));
