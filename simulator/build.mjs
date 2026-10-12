import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve,relative,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
/** Small deterministic ESM compiler for these named-import-only modules. No eval or remote code. */
export function bundle(entry){const factories=new Map();
 function visit(path){if(factories.has(path))return;const text=readFileSync(resolve(root,path),'utf8'),deps=[];
  const names=[...text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/g)].map(m=>m[1]);
  let body=text.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,symbols,source)=>{
   const dep=relative(root,resolve(root,dirname(path),source));if(dep.startsWith('..'))throw Error('outside-source-root');deps.push(dep);return `const {${symbols}} = require(${JSON.stringify(dep)});`;}).replace(/\bexport\s+/g,'');
  factories.set(path,body+`\nreturn {${names.join(',')}};`);deps.forEach(visit);
 }visit(entry);
 return `(()=>{'use strict';const modules={${[...factories].map(([p,b])=>`${JSON.stringify(p)}:require=>{\n${b}\n}`).join(',\n')}};const cache={};const require=p=>cache[p]??(cache[p]=modules[p](require));require(${JSON.stringify(entry)});})();\n`;
}
export function build(output){const out=resolve(output);if(out===root||out.startsWith(root+'/src/'))throw Error('unsafe-output');if(existsSync(out))throw Error('output-must-be-new');mkdirSync(out,{recursive:true});
 const files=['src/b1/identity.mjs','src/b1/scope-repository.mjs','src/b1/document-binding-broker.mjs','simulator/service.mjs','simulator/data.mjs','simulator/persistent-seed.mjs','simulator/worker.mjs','src/data/schema.mjs','src/data/partitioned.mjs','src/data/cooperate.mjs','src/data/hash.mjs','src/data/state.mjs','src/data/preferences.mjs','src/data/evidence.mjs','src/data/repository.mjs','src/data/backup.mjs','src/navigation/projection.mjs','src/navigation/icons.mjs'];
 files.push('src/data/verified-record-cache.mjs','src/data/free-evidence-partitions.mjs','src/data/free-recovery-status.mjs','src/data/free-runtime.mjs','src/data/free-runtime-service.mjs','src/data/free-evidence-repository.mjs','src/data/free-evidence.mjs','src/data/native-partitions.mjs','src/data/free-activity.mjs','src/data/free-time-policy.mjs','src/data/free-calibration.mjs','src/data/native-facts.mjs','src/data/native-repository.mjs','src/data/free-projection.mjs','simulator/native-seed.mjs');
 for(const path of files){mkdirSync(dirname(resolve(out,path)),{recursive:true});writeFileSync(resolve(out,path),readFileSync(resolve(root,path)));}
 writeFileSync(resolve(out,'content.js'),bundle('simulator/content-entry.mjs'));
 const manifest={manifest_version:3,name:'VAIWL High-Fidelity Host — synthetic only',version:'0.2.0',minimum_chrome_version:'120',permissions:['webNavigation'],action:{default_title:'Toggle VAIWL synthetic integration'},background:{service_worker:'simulator/worker.mjs',type:'module'},content_scripts:[{matches:['http://127.0.0.1/hf/*'],js:['content.js'],run_at:'document_idle',all_frames:false}],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'"}};
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const hashes={};for(const p of [...files,'content.js','manifest.json'])hashes[p]=createHash('sha256').update(readFileSync(resolve(out,p))).digest('hex');
 writeFileSync(resolve(out,'build-hashes.json'),JSON.stringify(hashes,null,2)+'\n');return hashes;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(!process.argv[2])throw Error('Pass a NEW dedicated build directory');console.log(JSON.stringify({status:'BUILT_NOT_ACCEPTED_AS_MV3',files:build(process.argv[2])},null,2));}
