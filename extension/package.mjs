import {compileClassicWorker} from './classic-worker-build.mjs';
import {OFFLINE_HISTORY_PROFILE} from '../src/runtime/historical-send-profile.mjs';
import {buildHost} from './build.mjs';
import {zip} from '../simulator/package.mjs';
import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
function files(root){const result=[];function walk(path){for(const name of readdirSync(join(root,path)).sort()){const relative=path?path+'/'+name:name,stat=lstatSync(join(root,relative));if(stat.isSymbolicLink())throw Error('host-package-symlink');if(stat.isDirectory())walk(relative);else if(stat.isFile())result.push(relative);else throw Error('host-package-special-file');}}walk('');return result.sort();}
export function verifyHost(unpacked){
 const root=resolve(unpacked),info=JSON.parse(readFileSync(join(root,'build-manifest.json'),'utf8')),manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
 if(info.schema!=='vaiwl-host-build-v1'||!['HOST_IMPLEMENTATION_UNVERIFIED','OFFLINE_HOST_RECONSTRUCTION'].includes(info.status)||info.releaseStatus!=='NOT_RELEASE_READY'||info.realChatGPT!=='NOT_RUN')throw Error('invalid-host-package-boundary');
 const match=info.status==='OFFLINE_HOST_RECONSTRUCTION'?'http://127.0.0.1/*':'https://chatgpt.com/*';

 if(manifest.manifest_version!==3||JSON.stringify(manifest.background)!==JSON.stringify({service_worker:'extension/worker.mjs'})||JSON.stringify(manifest.permissions)!==JSON.stringify(info.offlineContext===true||info.offlineFirstSend===true?['webNavigation','webRequest']:['webNavigation'])||JSON.stringify(manifest.host_permissions)!==JSON.stringify([match])||JSON.stringify(manifest.content_scripts?.map(value=>value.matches))!==JSON.stringify([[match]]))throw Error('invalid-host-package-permissions');
 const expected=Object.keys(info.files).sort();if(JSON.stringify(files(root).filter(name=>name!=='build-manifest.json'))!==JSON.stringify(expected))throw Error('unexpected-host-package-files');
 for(const name of expected){if(name.startsWith('/')||name.split('/').includes('..')||name.includes('\\')||!name)throw Error('invalid-host-package-path');if(sha(readFileSync(join(root,name)))!==info.files[name])throw Error('host-package-hash-mismatch:'+name);}
 const offline=info.status==='OFFLINE_HOST_RECONSTRUCTION',origin=new URL(info.origin);
 if(offline?(origin.origin!==info.origin||origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'):info.origin!=='https://chatgpt.com')throw Error('invalid-host-package-origin');
 if(Object.hasOwn(info,'offlineOldSendTerminal')&&(info.offlineOldSendTerminal!==true||!info.offlineFirstSend))throw Error('invalid-old-send-terminal-profile');
 if(Object.hasOwn(info,'offlineFirstSend')&&(info.offlineFirstSend!==true||!offline||info.offlineContext))throw Error('invalid-host-first-send-profile');
 if(Object.hasOwn(info,'offlineExistingSend')&&(info.offlineExistingSend!==true||!offline||!info.offlineContext||info.offlineFirstSend))throw Error('invalid-host-existing-send-profile');
 if(Object.hasOwn(info,'offlineContext')&&(info.offlineContext!==true||!offline))throw Error('invalid-host-context-profile');
 if(Object.hasOwn(info,'offlineHistory')&&(info.offlineHistory!==true||!offline))throw Error('invalid-host-history-profile');
 const contextSelection=info.offlineContext?'EXPLICIT_OFFLINE_C2_CONVERSATION':offline?'EXPLICIT_OFFLINE_C3':'UNVERIFIED_FAIL_CLOSED',scopeProfile=info.offlineContext?{id:'offline-native-request-context',singlePersonalDefault:false,browserRequestContext:true}:offline?{id:'offline-personal-reconstruction',singlePersonalDefault:true}:{id:'chatgpt-context-unverified',singlePersonalDefault:false};
 if(Object.hasOwn(info,'offlineSnippets')&&(info.offlineSnippets!==true||info.status!=='OFFLINE_HOST_RECONSTRUCTION'))throw Error('invalid-host-snippet-profile');
 if(info.contextSelection!==contextSelection||readFileSync(join(root,'extension/config.mjs'),'utf8')!=='export const HOST_CONFIG=Object.freeze('+JSON.stringify({origin:info.origin,scopeProfile,...(info.offlineOldSendTerminal?{offlineOldSendTerminal:true}:{}),...(info.offlineFirstSend?{offlineFirstSend:true,currentMetadataReadEnabled:true,sendCandidatesEnabled:true,sendAckProfile:{id:'loopback-first-send-ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}}}:{}),...(info.offlineExistingSend?{currentMetadataReadEnabled:true,sendCandidatesEnabled:true,sendAckProfile:{id:'loopback-existing-send-ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}}}:{}),...(info.offlineContext?{sessionProfile:{structures:{personal:'personal',workspace:'organization'},currentConversationContextHeader:true,currentConversationRosterContext:true}}:{}),...(info.offlineSnippets?{offlineSnippets:true}:{}),...(info.offlineHistory?{offlineHistory:true,currentMetadataReadEnabled:true,sendCandidatesEnabled:true,historicalSendProfile:OFFLINE_HISTORY_PROFILE}:{})})+');\n')throw Error('invalid-host-package-context');
 if(manifest.content_security_policy?.extension_pages!==`script-src 'self'; object-src 'none'; connect-src ${info.origin}`||manifest.web_accessible_resources?.length!==1||JSON.stringify(manifest.web_accessible_resources[0].matches)!==JSON.stringify([match])||manifest.web_accessible_resources[0].resources.some(path=>path.includes('*')||path.startsWith('src/runtime/')||path==='extension/worker.mjs'||path==='extension/classic-runtime.js'))throw Error('invalid-host-package-public-boundary');
 for(const name of expected.filter(name=>name.endsWith('.mjs'))){const source=readFileSync(join(root,name),'utf8');for(const match of [...source.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)]){if(!match[1].startsWith('.'))throw Error('nonlocal-host-package-import');const target=resolve(root,dirname(name),match[1]);if(!target.startsWith(root+'/')||!existsSync(target))throw Error('missing-host-package-import');}}
 const compiled=compileClassicWorker(root);
 if(readFileSync(join(root,'extension/worker.mjs'),'utf8')!==compiled.entry||readFileSync(join(root,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('host-package-worker-build-mismatch');
 return {status:info.status,releaseStatus:info.releaseStatus,files:expected.length+1};
}
export function packageHost(output,options={}){
 const out=resolve(output);if(existsSync(out))throw Error('output-must-be-new');mkdirSync(out,{recursive:true});const unpacked=join(out,'extension');buildHost(unpacked,options);const verified=verifyHost(unpacked),archive=join(out,'vaiwl-free-host-development.zip');writeFileSync(archive,zip(files(unpacked).map(name=>({name,data:readFileSync(join(unpacked,name))}))));const archiveSha256=sha(readFileSync(archive));writeFileSync(join(out,'SHA256SUMS'),archiveSha256+'  vaiwl-free-host-development.zip\n');return {...verified,unpacked,archive,archiveSha256};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(!process.argv[2])throw Error('Pass a NEW package output directory');console.log(JSON.stringify(packageHost(process.argv[2]),null,2));}
