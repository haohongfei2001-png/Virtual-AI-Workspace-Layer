import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
export function buildLocalWitness(output){
 const out=resolve(output);if(existsSync(out))throw Error('output-must-be-new');
 // Preserve the existing temporary navigation; no production runtime/auth bootstrap.
 const base=buildHost(out,{observedChatGPTContext:true,temporaryReadOnly:true});verifyHost(out);
 const esbuild=require('esbuild');if(esbuild.version!=='0.25.12')throw Error('unexpected-builder');
 const sourceHashes={...base.sourceHashes};
 for(const [entry,name]of [['worker','source-witness-worker.js'],['content','source-witness-content.js']]){
  const result=esbuild.buildSync({absWorkingDir:root,entryPoints:['tools/native-source-witness/'+entry+'.mjs'],bundle:true,format:'iife',platform:'browser',target:'chrome120',write:false,logLevel:'silent',metafile:true});
  writeFileSync(resolve(out,name),result.outputFiles[0].text);
  for(const path of Object.keys(result.metafile.inputs))sourceHashes[path]=sha(readFileSync(resolve(root,path)));
 }
 for(const [source,dest]of [['page.css','source-witness.css'],['page.html','source-witness.html'],['page.mjs','source-witness-page.mjs'],['entry.mjs','source-witness-entry.mjs']]){const path='tools/native-source-witness/'+source,bytes=readFileSync(resolve(root,path));writeFileSync(resolve(out,dest),bytes);sourceHashes[path]=sha(bytes);}
 sourceHashes['tools/native-source-witness/build.mjs']=sha(readFileSync(fileURLToPath(import.meta.url)));
 const manifest=JSON.parse(readFileSync(resolve(out,'manifest.json')));
 manifest.name='VAIWL Free — 本机来源验证开发版';
 manifest.permissions.push('storage');
 // No cookies/debugger/scripting/management/tabs or additional hosts.
 manifest.content_scripts.push({matches:['https://chatgpt.com/*'],js:['source-witness-content.js'],run_at:'document_start',all_frames:false,world:'ISOLATED'});
 writeFileSync(resolve(out,'manifest.json'),json(manifest));
 writeFileSync(resolve(out,'extension/worker.mjs'),readFileSync(resolve(out,'extension/worker.mjs'),'utf8')+"\nimportScripts('../source-witness-worker.js');\n");
 const status=readFileSync(resolve(out,'status.html'),'utf8').replace('extension/temporary-navigation.mjs','source-witness-entry.mjs');
 writeFileSync(resolve(out,'status.html'),status);
 writeFileSync(resolve(out,'LOCAL-WITNESS.txt'),'Development overlay / NOT_RELEASE_READY / real source witness NOT_RUN\nLoad this directory once in the authorized existing Chrome profile. Keep the same loaded directory and extension ID for readback. No CDP, no remote controller. Open ChatGPT, click VAIWL > 本机一次性来源验证. Confirm the selected environment and click 授权并准备一次验证. In the original tab, naturally open one existing conversation, then return to the result page. It runs once automatically after a new browser receipt. No refresh, login, DevTools or credential copying.\nOnly anonymous result and spent marker are stored. Worker loss never retries. Download the redacted report from the result page; it is never automatically uploaded.\n');
 writeFileSync(resolve(out,'README.txt'),'VAIWL 开发专用来源见证叠加包 / NOT_RELEASE_READY\n原临时只读导航保留；只有用户在本机验证页明确点击授权后，才等待单个选定标签的一次自然聊天导航并执行有界验证。它不是普通生产构建，不自动身份刷新、不读旧库、不自动上传。\n详见 LOCAL-WITNESS.txt。使用相同目录更新，先保存旧包与人工资产，不卸载来重置权限或单次状态。\n');
 const files={};function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())walk(p);else if(e.name!=='local-witness-manifest.json')files[relative(out,p)]=sha(readFileSync(p));}}walk(out);
 const receipt={kind:'USER_STARTED_LOCAL_SOURCE_WITNESS_DEVELOPMENT_ONLY',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',baseReceiptSha256:sha(readFileSync(resolve(out,'build-manifest.json'))),permissionsAdded:['storage'],maxGETs:12,maxElapsedMs:30000,maxChainMs:6000,maxBytes:4194304,maxConcurrent:1,retries:0,sourceHashes,files};
 writeFileSync(resolve(out,'local-witness-manifest.json'),json(receipt));return receipt;
}
export function verifyLocalWitness(output){
 const out=resolve(output),receipt=JSON.parse(readFileSync(resolve(out,'local-witness-manifest.json'))),found=[];
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isSymbolicLink())throw Error('unexpected-symlink');if(e.isDirectory())walk(p);else if(e.name!=='local-witness-manifest.json')found.push(relative(out,p));}}walk(out);
 if(found.length!==Object.keys(receipt.files).length)throw Error('unexpected-package-files');
 for(const p of found)if(receipt.files[p]!==sha(readFileSync(resolve(out,p))))throw Error('package-hash-mismatch');
 for(const [p,h]of Object.entries(receipt.sourceHashes))if(h!==sha(readFileSync(resolve(root,p))))throw Error('source-hash-mismatch');
 // Reconstruct the fixed overlay from current tracked sources. Rehashed extra
 // permissions, substituted bundles and omitted source hashes must not pass.
 const temporary=mkdtempSync(resolve(tmpdir(),'vaiwl-witness-verify-'));
 try{const expected=buildLocalWitness(resolve(temporary,'extension'));if(JSON.stringify(receipt)!==JSON.stringify(expected))throw Error('witness-overlay-mismatch');}finally{rmSync(temporary,{recursive:true,force:true});}
 return {kind:receipt.kind,files:found.length,sourcePaths:Object.keys(receipt.sourceHashes).length,realChatGPT:receipt.realChatGPT};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [out,mode]=process.argv.slice(2);if(!out||mode&&mode!=='--verify')throw Error('usage: node tools/native-source-witness/build.mjs OUTPUT [--verify]');
 console.log(json(mode?verifyLocalWitness(out):{output:resolve(out),...buildLocalWitness(out),files:undefined,sourceHashes:undefined}));
}
