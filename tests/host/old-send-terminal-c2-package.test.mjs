import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const options={offlineOrigin:'http://127.0.0.1:1234',offlineContext:true,offlineExistingSend:true,offlineHistory:true,offlineOldSendTerminal:true};
function root(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-terminal-c2-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('C2 existing-conversation package retains exact failure terminal and history profiles',t=>{
 const built=packageHost(join(root(t),'package'),options);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 const config=readFileSync(join(built.unpacked,'extension/config.mjs'),'utf8');
 for(const key of ['offlineOldSendTerminal','currentMetadataReadEnabled','sendCandidatesEnabled','browserRequestContext'])assert(config.includes('"'+key+'":true'));
 assert(config.includes('loopback-existing-send-ack'));assert(!config.includes('"offlineFirstSend":true'));assert(config.includes('"singlePersonalDefault":false'));
 const manifest=JSON.parse(readFileSync(join(built.unpacked,'manifest.json')));assert.deepEqual(manifest.permissions,['webNavigation','webRequest']);assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);
});
test('terminal cannot be enabled without a valid loopback send profile',t=>{
 const dir=root(t);let n=0;
 for(const patch of [{offlineOrigin:null},{offlineOrigin:'https://chatgpt.com'},{offlineExistingSend:false},{offlineContext:false},{offlineFirstSend:true}])assert.throws(()=>packageHost(join(dir,String(n++)),{...options,...patch}));
});
test('package verification rejects removal of C2 scope or send authority',t=>{
 const built=packageHost(join(root(t),'package'),options),path=join(built.unpacked,'build-manifest.json'),original=JSON.parse(readFileSync(path));
 for(const patch of [{offlineExistingSend:false},{offlineContext:false},{offlineOldSendTerminal:false},{offlineFirstSend:true}]){writeFileSync(path,JSON.stringify({...original,...patch}));assert.throws(()=>verifyHost(built.unpacked));}
 writeFileSync(path,JSON.stringify(original));assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
});
