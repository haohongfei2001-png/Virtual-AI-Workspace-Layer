#!/usr/bin/env node
/** Offline, sequential, test-only source mutations. Never edits the input tree.
 * node tests/host/guard-mutations.runner.mjs --report /tmp/guards.json
 * Add --only origin,old-epoch for a targeted subset. No package manager/browser.
 */
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mutations} from './guard-mutations/manifest.mjs';
import {baselinePass,classifyMutant} from './guard-mutations/outcome.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
for(let i=0;i<args.length;i+=2)if(!['--only','--report','--source-commit'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: --only id,id --report /path/report.json --source-commit verified-sha');
const selected=option('--only')?.split(',')??mutations.map(m=>m.id);
if(new Set(selected).size!==selected.length||selected.some(id=>!mutations.some(m=>m.id===id)))throw Error('unknown-or-duplicate-mutation');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashFile=p=>hash(readFileSync(join(root,p)));
function treeHash(path){const rows=[];function visit(dir){for(const e of readdirSync(join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='node_modules')continue;const p=join(dir,e.name);if(e.isDirectory())visit(p);else if(e.isFile())rows.push([p,hashFile(p)]);else throw Error('unsupported-tree-entry: '+p);}}visit(path);return hash(JSON.stringify(rows));}
const inputHashes=Object.fromEntries(['src','tests','simulator'].map(p=>[p,treeHash(p)]));
const report={specRevision:'VA-HOST/1.1 FINAL §5.2',sourceCommit:option('--source-commit')??null,sourceCommitProvenance:option('--source-commit')?'caller-supplied; source hashes authoritative':'not supplied',node:process.version,platform:process.platform,hashScope:'src/tests/simulator excluding dependency node_modules directories',networkPolicy:'No network/browser commands; local Node test processes only',S:'NOT_RUN',D:'NOT_RUN (MOCK_IDB is L only)',G:'NOT_RUN',U:'NOT_RUN',release:'NOT_RELEASE_READY',selected,inputHashes,testArtifactHash:hash([treeHash('tests/host/guard-mutations'),hashFile('tests/host/guard-mutations.runner.mjs')].join(':')),manifestHash:hashFile('tests/host/guard-mutations/manifest.mjs'),runnerHash:hashFile('tests/host/guard-mutations.runner.mjs'),results:[]};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function run(tree,m){
 const child=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-name-pattern=^'+escape(m.testName)+'$','--test-reporter='+join(tree,'tests/host/guard-mutations/reporter.mjs'),join(tree,m.testFile)],{cwd:tree,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
 let records=[];try{records=child.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{}
 return {exitCode:child.status,signal:child.signal,error:child.error?.message,records,stderr:child.stderr,stdoutHash:hash(child.stdout??''),stderrHash:hash(child.stderr??'')};
}
const work=mkdtempSync(join(tmpdir(),'vaiwl-guard-build-'));
try{
 // Copy a frozen baseline once. Every mutant starts from the exact same bytes.
 const baseline=join(work,'baseline');mkdirSync(baseline);
 for(const name of ['src','tests','simulator'])cpSync(join(root,name),join(baseline,name),{recursive:true,filter:source=>!source.split(/[/\\]/).includes('node_modules')});
 for(const m of mutations.filter(m=>selected.includes(m.id))){
  const result={id:m.id,specIds:m.specIds,evidence:m.evidence,limitations:m.limitations,status:'NOT_RUN',sourceFile:m.file,sourceHash:hashFile(m.file),testFile:m.testFile,testHash:hashFile(m.testFile),targetCase:m.testName};report.results.push(result);
  const source=readFileSync(join(baseline,m.file),'utf8'),count=source.split(m.before).length-1;
  if(count!==1){result.status='PATCH_MISMATCH';result.reason=`Expected exactly one mutation site; found ${count}`;continue;}
  result.baseline=run(baseline,m);
  if(!baselinePass(result.baseline,m.testName)) {result.status='BASELINE_FAILED';continue;}
  const tree=join(work,'mutant');mkdirSync(tree);for(const name of ['src','tests','simulator'])cpSync(join(baseline,name),join(tree,name),{recursive:true,filter:source=>!source.split(/[/\\]/).includes('node_modules')});
  try{
   const mutated=source.replace(m.before,m.after);writeFileSync(join(tree,m.file),mutated);result.mutantHash=hash(mutated);
   const syntax=spawnSync(process.execPath,['--check',join(tree,m.file)],{encoding:'utf8',timeout:10000});
   if(syntax.status!==0){result.status='INVALID_MUTANT';result.reason=syntax.stderr;continue;}
   result.mutant=run(tree,m);
   result.status=classifyMutant(result.mutant,m.testName);
  }finally{rmSync(tree,{recursive:true,force:true});}
  console.log(`${m.id}: ${result.status}`);
 }
 // No mutation is ever applied to root; verify all referenced original bytes too.
 report.inputUnchanged=Object.entries(inputHashes).every(([p,h])=>treeHash(p)===h)&&report.results.every(r=>hashFile(r.sourceFile)===r.sourceHash&&hashFile(r.testFile)===r.testHash);
 report.summary={selected:report.results.length,killed:report.results.filter(r=>r.status==='KILLED').length,pass:report.inputUnchanged&&report.results.every(r=>r.status==='KILLED')};
 const output=option('--report');if(output){mkdirSync(dirname(resolve(output)),{recursive:true,filter:source=>!source.split(/[/\\]/).includes('node_modules')});writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report.summary));process.exitCode=report.summary.pass?0:1;
}finally{rmSync(work,{recursive:true,force:true});}
