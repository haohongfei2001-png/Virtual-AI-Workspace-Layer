#!/usr/bin/env node
/** Sequential CI-only real browser mutation builds, never edits checkout sources. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync,readdirSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {browserMutations} from './guard-mutations/browser-manifest.mjs';
import {snapshotInputs,finalizeIntegrity} from './guard-mutations/browser-input-integrity.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(process.argv[2]??join(tmpdir(),'vaiwl-browser-guards.json')),only=process.argv[3];
if(only&&!browserMutations.some(m=>m.id===only))throw Error('unknown-mutation');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={specRevision:'VA-HOST/1.1 FINAL §5.2',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,sourceCommitProvenance:'caller supplied; per-build source hashes authoritative',G:'NOT_RUN',U:'NOT_RUN',release:'NOT_RELEASE_READY',results:[]};
const dir=mkdtempSync(join(tmpdir(),'vaiwl-browser-guards-'));let inputBefore;
const selected=browserMutations.filter(m=>!only||m.id===only);
function copy(target){mkdirSync(target);for(const name of ['src','extension','simulator','tests'])cpSync(join(root,name),join(target,name),{recursive:true,filter:path=>!path.split('/').includes('node_modules')});const deps=join(root,'tests/b1/tooling/node_modules');if(!existsSync(deps))throw Error('preinstalled-playwright-required');symlinkSync(deps,join(target,'tests/b1/tooling/node_modules'),'dir');}
function run(tree,m,stage){const file=join(dir,m.id+'-'+stage+'.json');const child=spawnSync(process.execPath,['tests/host/guard-mutations/browser-probe.mjs',m.id,file],{cwd:tree,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,NODE_OPTIONS:''}});let result;try{result=JSON.parse(readFileSync(file));}catch{result={status:'NO_REPORT'};}return {exit:child.status,signal:child.signal,error:child.error?.message,stdout:child.stdout,stderr:child.stderr,...result};}
try{
 inputBefore=snapshotInputs(root);report.inputBefore=inputBefore;
 for(const m of selected){
  const row={id:m.id,spec:m.spec,evidence:m.evidence,status:'NOT_RUN',sourceHash:sha(readFileSync(join(root,m.file)))};report.results.push(row);const tree=join(dir,m.id);copy(tree);
  try{
   row.baseline=run(tree,m,'baseline');if(row.baseline.status!=='PASS'||row.baseline.exit!==0){row.status='BASELINE_FAILED';continue;}
   let bytes=readFileSync(join(tree,m.file),'utf8');for(const [before,after] of m.edits){if(bytes.split(before).length!==2)throw Error('mutation-anchor-mismatch:'+m.id);bytes=bytes.replace(before,after);}writeFileSync(join(tree,m.file),bytes);row.mutantSourceHash=sha(bytes);
   const syntax=spawnSync(process.execPath,['--check',join(tree,m.file)],{encoding:'utf8'});if(syntax.status!==0)throw Error('invalid-mutant-syntax');
   row.mutant=run(tree,m,'mutant');row.status=row.mutant.status==='TARGET_ASSERTION_FAILURE'&&row.mutant.phase==='target'&&row.mutant.error?.code==='ERR_ASSERTION'&&row.mutant.exit===1&&!row.mutant.signal?'KILLED':row.mutant.status==='PASS'?'SURVIVED':'INVALID_FAILURE';
  }catch(error){row.status='INFRASTRUCTURE_FAILURE';row.error=error.stack;}finally{rmSync(tree,{recursive:true,force:true});console.log(m.id+': '+row.status);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 }
}catch(error){report.error=error.stack;process.exitCode=1;}finally{
 report.pass=finalizeIntegrity(report,root,inputBefore,selected.length);process.exitCode=report.pass?0:1;
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');rmSync(dir,{recursive:true,force:true});
}
