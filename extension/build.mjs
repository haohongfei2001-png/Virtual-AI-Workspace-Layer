import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const imports=text=>[...text.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
function closure(entries){const found=new Map();function visit(path){if(found.has(path))return;if(!path.startsWith('src/')&&!path.startsWith('extension/'))throw Error('non-host-build-dependency');const source=readFileSync(resolve(root,path),'utf8');found.set(path,source);for(const dependency of imports(source)){if(!dependency.startsWith('.'))throw Error('nonlocal-host-import');visit(relative(root,resolve(root,dirname(path),dependency)).split(sep).join('/'));}}entries.forEach(visit);return found;}
/** Builds production code or an explicitly loopback-only offline test package. */
export function buildHost(output,{offlineOrigin=null}={}){
 const out=resolve(output);if(existsSync(out))throw Error('output-must-be-new');if(out===root||out.startsWith(root+'/src/'))throw Error('unsafe-host-output');
 const origin=offlineOrigin??'https://chatgpt.com';
 if(offlineOrigin!==null){const parsed=new URL(origin);if(parsed.origin!==origin||parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1')throw Error('offline-origin-must-be-loopback');}
 const scopeProfile=offlineOrigin===null?{id:'chatgpt-context-unverified',singlePersonalDefault:false}:{id:'offline-personal-reconstruction',singlePersonalDefault:true};
 const entries=['extension/worker.mjs','extension/content-entry.mjs','extension/workspace.mjs','extension/sidebar.mjs'],modules=closure(entries),publicModules=closure(entries.slice(1));
 modules.set('extension/config.mjs','export const HOST_CONFIG=Object.freeze('+JSON.stringify({origin,scopeProfile})+');\n');
 const match=offlineOrigin===null?'https://chatgpt.com/*':'http://127.0.0.1/*';
 const manifest={manifest_version:3,name:'VAIWL Free Host — development',version:'0.3.0',minimum_chrome_version:'120',permissions:['webNavigation'],host_permissions:[match],background:{service_worker:'extension/worker.mjs',type:'module'},content_scripts:[{matches:[match],js:['content.js'],run_at:'document_idle',all_frames:false}],web_accessible_resources:[{resources:['workspace.html','sidebar.html',...publicModules.keys()].sort(),matches:[match]}],content_security_policy:{extension_pages:`script-src 'self'; object-src 'none'; connect-src ${origin}`}};
 const files=new Map(modules);files.set('content.js',"void import(chrome.runtime.getURL('extension/content-entry.mjs')).catch(()=>{});\n");
 for(const role of ['workspace','sidebar'])files.set(role+'.html',readFileSync(resolve(root,'extension',role+'.html'),'utf8'));
 files.set('manifest.json',json(manifest));
 files.set('README.txt','VAIWL Free Host development / NOT_RELEASE_READY\n'+(offlineOrigin===null?'ChatGPT context selection is not yet verified; the default build fails closed. Do not treat this package as accepted Free.\n':'Offline loopback reconstruction only; no private ChatGPT or production acceptance.\n')+'Load unpacked only in a separate test profile. No native writes, AI service or deployment is provided. Keep the same extension identity and a manual backup when testing an upgrade; uninstall may delete extension storage.\n');
 mkdirSync(out,{recursive:true});for(const [path,source]of files){mkdirSync(dirname(resolve(out,path)),{recursive:true});writeFileSync(resolve(out,path),source);}
 const info={schema:'vaiwl-host-build-v1',status:offlineOrigin===null?'HOST_IMPLEMENTATION_UNVERIFIED':'OFFLINE_HOST_RECONSTRUCTION',releaseStatus:'NOT_RELEASE_READY',realChatGPT:'NOT_RUN',origin,contextSelection:offlineOrigin===null?'UNVERIFIED_FAIL_CLOSED':'EXPLICIT_OFFLINE_C3',sourceHashes:Object.fromEntries([...closure(entries)].map(([path,source])=>[path,hash(source)])),files:Object.fromEntries([...files].map(([path,source])=>[path,hash(source)]))};
 writeFileSync(resolve(out,'build-manifest.json'),json(info));return info;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(!process.argv[2])throw Error('Pass a NEW dedicated output directory');console.log(json(buildHost(process.argv[2])));}
