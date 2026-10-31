/** Package the candidate and prove the standalone Free dependency graph remains
 * independent. These are development artifacts, never installation commands. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const output=resolve(process.argv[2]??'artifacts/unified-r1/packages');
await mkdir(output,{recursive:true});
const sourceSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceStatus=()=>execFileSync('git',['status','--porcelain','--untracked-files=all','--','src','extension','tests','.github/workflows/vaiwl-unified-r1.yml'],{encoding:'utf8'}).trim();
const sourceStatusBefore=sourceStatus();
if(process.env.VAIWL_SOURCE_COMMIT&&process.env.VAIWL_SOURCE_COMMIT!==sourceSHA)throw Error('package-source-sha-mismatch');
if(process.env.CI==='true'&&sourceStatusBefore)throw Error('package-CI-source-must-match-commit');
const profiles=[['standalone-free',{browserLocal:true}],['unified-free-pro',{browserLocal:true,proR1:true}]];
const report={format:'vaiwl-unified-package-verification/1',sourceSHA,sourceStatusBefore,sourceMatchesCommit:sourceStatusBefore==='',status:'RUNNING',releaseStatus:'NOT_RELEASE_READY',realChatGPT:'NOT_RUN',profiles:[]};
try{
 for(const [name,options] of profiles){
  const built=packageHost(join(output,name),options),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
  const manifest=JSON.parse(await readFile(join(built.unpacked,'manifest.json'),'utf8'));
  const modules=Object.keys(info.files),proModules=modules.filter(path=>path.startsWith('src/pro/'));
  const exposed=new Set(manifest.web_accessible_resources.flatMap(row=>row.resources));
  assert(!modules.some(path=>path.startsWith('tests/')||path.includes('fixture-owner')),'test owner must never be packaged');
  assert.equal(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"),true,'formal Browser-Local has no cloud transport');
  if(name==='standalone-free')assert.equal(proModules.length,0,'Free package must not import Pro');
  else{
   for(const required of ['src/pro/ui/remote-controller.mjs','src/pro/integration/worker-service.mjs','src/pro/integration/same-db-store.mjs'])assert(modules.includes(required),'missing production Pro module '+required);
   for(const path of proModules.filter(path=>/integration\/(?:worker-service|production-owner|same-db-store|billing-store|composite-backup|storage-registry|storage-recovery)|runtime\/controller|model\//.test(path)))assert(!exposed.has(path),'private Pro module exposed as WAR: '+path);
  }
  report.profiles.push({name,options,...built,verification:verifyHost(built.unpacked),proModuleCount:proModules.length,sourceHashes:info.sourceHashes});
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{report.sourceStatusAfter=sourceStatus();report.sourceMatchesCommit=report.sourceMatchesCommit&&report.sourceStatusAfter==='';await writeFile(join(output,'package-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,sourceSHA,sourceMatchesCommit:report.sourceMatchesCommit,profiles:report.profiles.map(p=>({name:p.name,archive:p.archive,sha256:p.archiveSha256,files:p.files})),error:report.error}));}
