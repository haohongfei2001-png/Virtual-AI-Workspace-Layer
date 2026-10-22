import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {BATCH} from './runner.mjs';
import {PASSIVE_BATCH,PREVIOUS_PASSIVE_BATCH,PREVIOUS_PASSIVE_V2_BATCH,PREVIOUS_PASSIVE_V3_BATCH} from './worker.mjs';
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
 writeFileSync(resolve(out,'LOCAL-WITNESS.txt'),'Development overlay / PASSIVE_C2_ONLY / NOT_RELEASE_READY\nUse only the same installed directory and authorized Chrome profile that holds all four prior consumed results (active/v1/v2: no-native-context-observed; v3: single-navigation-boundary). Keep all four ledgers unchanged. Open a ChatGPT home tab, click VAIWL > 本机一次性来源验证, click 确认此 Profile，开始观察 once after checking the environment. Once the observer is ready it returns to the exact original tab automatically; naturally click one existing conversation in the native sidebar. Results appear automatically; the result tab is selected only if the original target is still active in the same window. Otherwise return to the existing result tab yourself. Do not select another same-name tab.\nZero active GETs; no session/accounts/directory calls or response bodies. Existing filtered browser metadata and current DOM ID association only; preparation <=120s, association <=6s. No CDP, remote controller, refresh, login, DevTools or credential copying. Only fixed anonymous diagnostics and a separate spent marker are stored. Worker loss never retries. Reports are never automatically uploaded.\n');
 writeFileSync(resolve(out,'README.txt'),'VAIWL 开发专用被动关联观察 / NOT_RELEASE_READY\n复用原导航和诊断入口；新批准批次只被动观察一次原生聊天导航，0主动GET，不读响应正文，不认证、不读旧库、不自动上传。前四批结果与单次标记保持，缺少原安装的任一已消费结果时拒绝准备。点击“确认此 Profile，开始观察”后自动精确返回，只需在原生侧栏点一次已有聊天。结果自动显示；仅当仍在原目标标签和同一窗口时自动切回结果页，不打断其他标签。\n详见 LOCAL-WITNESS.txt。使用相同目录更新，先保存旧包与人工资产，不卸载或删除存储。\n');
 const files={};function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())walk(p);else if(e.name!=='local-witness-manifest.json')files[relative(out,p)]=sha(readFileSync(p));}}walk(out);
 const receipt={kind:'USER_STARTED_LOCAL_SOURCE_WITNESS_DEVELOPMENT_ONLY',mode:'PASSIVE_C2_ONLY',batchId:PASSIVE_BATCH,previousBatchId:BATCH,previousPassiveBatchId:PREVIOUS_PASSIVE_BATCH,previousPassiveV2BatchId:PREVIOUS_PASSIVE_V2_BATCH,previousPassiveV3BatchId:PREVIOUS_PASSIVE_V3_BATCH,realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',baseReceiptSha256:sha(readFileSync(resolve(out,'build-manifest.json'))),permissionsAdded:['storage'],maxGETs:0,maxElapsedMs:126000,maxPreparationMs:120000,maxChainMs:6000,maxBytes:0,maxConcurrent:0,retries:0,sourceHashes,files};
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
