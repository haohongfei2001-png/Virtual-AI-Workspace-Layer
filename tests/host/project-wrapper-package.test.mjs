import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
test('wrapper diagnostic build is default-off, BrowserLocal-only, mutually exclusive and keeps production permissions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-wrapper-package-'));
 try{
  const ordinary=buildHost(join(dir,'normal'),{browserLocal:true}),diagnostic=buildHost(join(dir,'diagnostic'),{browserLocal:true,projectWrapperDiagnostic:true});
  verifyHost(join(dir,'normal'));verifyHost(join(dir,'diagnostic'));
  assert.equal(ordinary.projectWrapperDiagnostic,undefined);assert.equal(diagnostic.projectWrapperDiagnostic,true);assert.equal(diagnostic.mainMountDiagnostic,undefined);
  const normal=JSON.parse(readFileSync(join(dir,'normal/manifest.json'),'utf8')),special=JSON.parse(readFileSync(join(dir,'diagnostic/manifest.json'),'utf8'));
  for(const key of ['permissions','host_permissions','content_security_policy','web_accessible_resources'])assert.deepEqual(special[key],normal[key]);
  for(const opts of [{projectWrapperDiagnostic:true},{browserLocal:true,mainMountDiagnostic:true,projectWrapperDiagnostic:true},{browserLocal:true,projectWrapperDiagnostic:'true'}])assert.throws(()=>buildHost(join(dir,'invalid'),opts),/project-wrapper-diagnostic-browser-local-only/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
