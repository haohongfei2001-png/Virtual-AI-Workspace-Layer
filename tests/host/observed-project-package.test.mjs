import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {loopbackProjectAssociationProfile} from '../../src/host/loopback-project-association-profile.mjs';
import {CHATGPT_OBSERVED_PROFILE as profile} from '../../src/host/chatgpt-observed-profile.mjs';
const origin='http://127.0.0.1:8123',options={offlineOrigin:origin,offlineContext:true,offlineProjectContext:true,offlineObservedProjectLayout:true};
function out(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-project-layout-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'extension');}
test('observed Project layout package is explicit loopback C2 with no extra data or send sources',async t=>{
 const path=out(t),info=buildHost(path,options),{HOST_CONFIG:c}=await import(pathToFileURL(join(path,'extension/config.mjs')));
 assert.equal(verifyHost(path).status,'OFFLINE_HOST_RECONSTRUCTION');assert.equal(info.offlineObservedProjectLayout,true);
 assert.equal(c.surfaceProfile,profile.id);assert.equal(c.scopeProfile.projectRequestContext,'loopback-project-v1');
 assert.equal(info.realChatGPT,'NOT_RUN');assert.equal(info.releaseStatus,'NOT_RELEASE_READY');
 for(const k of ['currentMetadataReadEnabled','sendCandidatesEnabled','sendAckProfile','historicalSendProfile'])assert.equal(Object.hasOwn(c,k),false);
 const bridge=loopbackProjectAssociationProfile(profile,c,origin);
 assert.equal(bridge.memberProjectIdAttribute,'data-vaiwl-fixture-project-id');assert.equal(profile.memberProjectIdAttribute,undefined);
 assert.notEqual(bridge.regions,profile.regions);assert.equal(profile.regions.members,'[role="tabpanel"]');
 const configPath=join(path,'extension/config.mjs'),changed=readFileSync(configPath,'utf8').replace('"offlineObservedProjectLayout":true','"offlineObservedProjectLayout":false');
 writeFileSync(configPath,changed);info.files['extension/config.mjs']=createHash('sha256').update(changed).digest('hex');writeFileSync(join(path,'build-manifest.json'),JSON.stringify(info));
 assert.throws(()=>verifyHost(path),/invalid-host-package-context/);
});
for(const patch of [{offlineOrigin:null},{offlineOrigin:'https://chatgpt.com'},{offlineOrigin:'http://localhost:8123'},{offlineContext:false},{offlineProjectContext:false},...['offlineSnippets','offlineFirstSend','offlineHistory','offlineExistingSend','offlineOldSendTerminal','observedChatGPTContext','temporaryReadOnly'].map(k=>({[k]:true}))])test('Project layout rejects incompatible package '+JSON.stringify(patch),t=>assert.throws(()=>buildHost(out(t),{...options,...patch})));
test('rehashing build metadata cannot add Project fixture grammar to a production package',t=>{
 const path=out(t),info=buildHost(path,{observedChatGPTContext:true});info.offlineObservedProjectLayout=true;writeFileSync(join(path,'build-manifest.json'),JSON.stringify(info));
 assert.throws(()=>verifyHost(path),/invalid-observed-project-layout-profile/);
});
test('runtime refuses off-origin or absent Project fixture authority configuration',()=>{
 const config={origin,offlineObservedProjectLayout:true,scopeProfile:{browserRequestContext:true,projectRequestContext:'loopback-project-v1'}};
 for(const actual of ['https://chatgpt.com','http://localhost:8123','http://127.0.0.1:8124',origin+'/'])assert.throws(()=>loopbackProjectAssociationProfile(profile,config,actual));
 for(const patch of [{offlineObservedProjectLayout:false},{scopeProfile:{}},{origin:'https://chatgpt.com'}])assert.throws(()=>loopbackProjectAssociationProfile(profile,{...config,...patch},origin));
 assert.throws(()=>loopbackProjectAssociationProfile({...profile,id:'legacy'},config,origin));
});
