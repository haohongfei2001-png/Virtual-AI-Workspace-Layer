import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {verifyHost} from '../../extension/package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function buildProbe(base,output,tabId,{candidateChain=false,accountsSchema=false,accountsStructure=false}={}){
 if([candidateChain,accountsSchema,accountsStructure].some(v=>typeof v!=='boolean')||Number(candidateChain)+Number(accountsSchema)+Number(accountsStructure)>1)throw Error('invalid-diagnostic-mode');
 if(!Number.isSafeInteger(tabId)||tabId<0)throw Error('invalid-target-tab');
 base=resolve(base);output=resolve(output);
 if(existsSync(output))throw Error('output-must-be-new');
 verifyHost(base);
 const config=readFileSync(resolve(base,'extension/config.mjs'),'utf8');
 if(!config.includes('"temporaryReadOnly":true')||!config.includes('"origin":"https://chatgpt.com"'))throw Error('temporary-production-package-required');
 const esbuild=require('esbuild');if(esbuild.version!=='0.25.12')throw Error('unexpected-builder');
 mkdirSync(dirname(output),{recursive:true});cpSync(base,output,{recursive:true});
 const source=esbuild.buildSync({absWorkingDir:root,entryPoints:['tools/native-me-probe/content.mjs'],define:{VAIWL_CANDIDATE_CHAIN:String(candidateChain),VAIWL_ACCOUNTS_SCHEMA:String(accountsSchema),VAIWL_ACCOUNTS_STRUCTURE:String(accountsStructure)},bundle:true,format:'iife',platform:'browser',target:'chrome120',write:false,logLevel:'silent'}).outputFiles[0].text;
 writeFileSync(resolve(output,'native-me-probe.js'),source);
 writeFileSync(resolve(output,'native-me-probe-popup.mjs'),readFileSync(resolve(root,'tools/native-me-probe/popup.mjs')));
 writeFileSync(resolve(output,'native-me-probe-config.mjs'),`export const TARGET_TAB_ID=${tabId};\nexport const PROBE_KEY=${JSON.stringify(accountsStructure?'vaiwl-accounts-structure-20261019-consumed':accountsSchema?'vaiwl-accounts-schema-20261019-consumed':candidateChain?'vaiwl-native-me-candidate-20261019-consumed':'vaiwl-native-me-probe-20261019-consumed')};\nexport const PROBE_PREFIX=${JSON.stringify(accountsStructure?'VAIWL_ACCOUNTS_STRUCTURE':accountsSchema?'VAIWL_ACCOUNTS_SCHEMA':candidateChain?'VAIWL_ME_CANDIDATE':'VAIWL_ME_PROBE')};\n`);
 writeFileSync(resolve(output,'native-me-probe.html'),'<!doctype html><meta charset="utf-8"><style>body{box-sizing:border-box;width:440px;max-width:100vw;margin:0;padding:12px;font:14px system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{margin:2px 0;max-width:100%}</style><title>VAIWL 单次接入诊断</title><h1>VAIWL 单次接入诊断</h1><p>仅已授权专用 Profile；固定 GET /backend-api/me，6秒、256KiB、无重试。不认证、不打开旧数据库。</p><button id="run">执行已授权的一次验证</button><button id="read">读取已有结果（不发网络请求）</button><p><a href="status.html">返回临时只读导航</a></p><pre id="result">尚未执行</pre><script type="module" src="native-me-probe-popup.mjs"></script>'.replace('固定 GET /backend-api/me，6秒、256KiB、无重试。',accountsStructure?'仅 GET accounts/check/v4-2023-04-27，一次、6秒、1MiB、无重试；仅输出白名单结构类别、相等性与汇总计数，无账户值。':accountsSchema?'仅 GET accounts/check/v4-2023-04-27，一次、6秒、1MiB、无重试；仅输出固定结果码。':candidateChain?'最多 me → accounts → me，共用6秒，256KiB/1MiB/256KiB；中途失败即停，无重试。':'固定 GET /backend-api/me，6秒、256KiB、无重试。').replaceAll('单次接入诊断',accountsStructure?'一次集中结构诊断':accountsSchema?'一次账户结构诊断':candidateChain?'一次身份候选验证':'单次接入诊断'));
 const manifest=JSON.parse(readFileSync(resolve(output,'manifest.json')));
 manifest.action.default_popup='native-me-probe.html';
 manifest.content_scripts.push({matches:['https://chatgpt.com/*'],js:['native-me-probe.js'],run_at:'document_idle',all_frames:false,world:'ISOLATED'});
 writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Ordinary build receipt deliberately remains unchanged: this is NOT a normal
 // verifiable release package. Record the complete overlay separately.
 const hashes={};function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isDirectory())visit(file);else hashes[relative(output,file)]=sha(readFileSync(file));}}visit(output);
 const sources=Object.fromEntries(['reader.mjs','accounts.mjs','accounts-structure.mjs','candidate.mjs','content.mjs','popup.mjs','build.mjs'].map(name=>['tools/native-me-probe/'+name,sha(readFileSync(resolve(root,'tools/native-me-probe',name)))]));
 const receipt={sourceHashes:sources,kind:accountsStructure?'AUTHORIZED_SINGLE_ACCOUNTS_STRUCTURE_NOT_PRODUCT':accountsSchema?'AUTHORIZED_SINGLE_ACCOUNTS_SCHEMA_NOT_PRODUCT':candidateChain?'AUTHORIZED_SINGLE_CHAIN_CANDIDATE_NOT_PRODUCT':'AUTHORIZED_SINGLE_USE_DIAGNOSTIC_NOT_PRODUCT',candidateChain,accountsSchema,accountsStructure,targetTabId:tabId,endpoints:(accountsSchema||accountsStructure)?['https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27']:candidateChain?['https://chatgpt.com/backend-api/me','https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27','https://chatgpt.com/backend-api/me']:['https://chatgpt.com/backend-api/me'],deadlineMs:6000,maxBodyBytes:(accountsSchema||accountsStructure)?1048576:candidateChain?[262144,1048576,262144]:262144,maxAttempts:1,permissionsAdded:[],identityEnabled:false,baseReceiptSha256:sha(readFileSync(resolve(base,'build-manifest.json'))),files:hashes};
 writeFileSync(resolve(output,'native-me-probe-manifest.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildProbe(process.argv[2],process.argv[3],Number(process.argv[4]),{candidateChain:process.argv[5]==='candidate-chain',accountsSchema:process.argv[5]==='accounts-schema',accountsStructure:process.argv[5]==='accounts-structure'}),null,2));
