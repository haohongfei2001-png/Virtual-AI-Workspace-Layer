import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {verifyHost} from '../../extension/package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function buildProbe(base,output,tabId){
 if(!Number.isSafeInteger(tabId)||tabId<0)throw Error('invalid-target-tab');
 base=resolve(base);output=resolve(output);
 if(existsSync(output))throw Error('output-must-be-new');
 verifyHost(base);
 const config=readFileSync(resolve(base,'extension/config.mjs'),'utf8');
 if(!config.includes('"temporaryReadOnly":true')||!config.includes('"origin":"https://chatgpt.com"'))throw Error('temporary-production-package-required');
 const esbuild=require('esbuild');if(esbuild.version!=='0.25.12')throw Error('unexpected-builder');
 mkdirSync(dirname(output),{recursive:true});cpSync(base,output,{recursive:true});
 const source=esbuild.buildSync({absWorkingDir:root,entryPoints:['tools/native-me-probe/content.mjs'],bundle:true,format:'iife',platform:'browser',target:'chrome120',write:false,logLevel:'silent'}).outputFiles[0].text;
 writeFileSync(resolve(output,'native-me-probe.js'),source);
 writeFileSync(resolve(output,'native-me-probe-popup.mjs'),readFileSync(resolve(root,'tools/native-me-probe/popup.mjs')));
 writeFileSync(resolve(output,'native-me-probe-config.mjs'),`export const TARGET_TAB_ID=${tabId};\n`);
 writeFileSync(resolve(output,'native-me-probe.html'),'<!doctype html><meta charset="utf-8"><title>VAIWL 单次接入诊断</title><h1>VAIWL 单次接入诊断</h1><p>仅已授权专用 Profile；固定 GET /backend-api/me，6秒、256KiB、无重试。不认证、不打开旧数据库。</p><button id="run">执行已授权的一次验证</button><button id="read">读取已有结果（不发网络请求）</button><p><a href="status.html">返回临时只读导航</a></p><pre id="result">尚未执行</pre><script type="module" src="native-me-probe-popup.mjs"></script>');
 const manifest=JSON.parse(readFileSync(resolve(output,'manifest.json')));
 manifest.action.default_popup='native-me-probe.html';
 manifest.content_scripts.push({matches:['https://chatgpt.com/*'],js:['native-me-probe.js'],run_at:'document_idle',all_frames:false,world:'ISOLATED'});
 writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Ordinary build receipt deliberately remains unchanged: this is NOT a normal
 // verifiable release package. Record the complete overlay separately.
 const hashes={};function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isDirectory())visit(file);else hashes[relative(output,file)]=sha(readFileSync(file));}}visit(output);
 const sources=Object.fromEntries(['reader.mjs','content.mjs','popup.mjs','build.mjs'].map(name=>['tools/native-me-probe/'+name,sha(readFileSync(resolve(root,'tools/native-me-probe',name)))]));
 const receipt={sourceHashes:sources,kind:'AUTHORIZED_SINGLE_USE_DIAGNOSTIC_NOT_PRODUCT',targetTabId:tabId,endpoint:'https://chatgpt.com/backend-api/me',deadlineMs:6000,maxBodyBytes:262144,maxAttempts:1,permissionsAdded:[],identityEnabled:false,baseReceiptSha256:sha(readFileSync(resolve(base,'build-manifest.json'))),files:hashes};
 writeFileSync(resolve(output,'native-me-probe-manifest.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildProbe(process.argv[2],process.argv[3],Number(process.argv[4])),null,2));
