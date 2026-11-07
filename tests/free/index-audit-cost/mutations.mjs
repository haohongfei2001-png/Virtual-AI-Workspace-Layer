/** Precise helper mutants in an owned temporary copy. Never edits the input tree. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './fixture.mjs';
const directory=mkdtempSync(join(tmpdir(),'vaiwl-page-mutants-')),reports=[];
try{
 for(const name of ['src','tests','simulator'])cpSync(join(root,name),join(directory,name),{recursive:true,filter:path=>!path.includes('node_modules')});
 const originalPatch=join(directory,'tests/free/index-audit-cost/integration.patch');
 const accepts=reverse=>spawnSync('git',['apply','--check',...(reverse?['--reverse']:[]),originalPatch],{cwd:directory}).status===0;
 const forward=accepts(false),reverse=accepts(true);assert(forward!==reverse,'owner source must match either side of the exact integration patch');
 if(reverse)assert.equal(spawnSync('git',['apply','--reverse',originalPatch],{cwd:directory}).status,0);
 const path=join(directory,'src/data/native-index-page.mjs'),source=readFileSync(path,'utf8');
 const changes=[
  ['scope-root-check', ' validateNativeIndexRoot(root,scope);',' // MUTANT: no root/scope check'],
  ['full-manifest-size', ' if(units>16*1024*1024)', ' if(false&&units>16*1024*1024)'],
  ['global-ordinal-check', '  if(orderError||seen.some(value=>value===0))','  if(false&&(orderError||seen.some(value=>value===0)))'],
  ['integer-key-order', ' if(integerKey)return legacy();',' if(false&&integerKey)return legacy();'],
  ['ordinary-input-fallback', ' if(!nativeIndex.hasNativeIndexSnapshotProof?.(root,records))return legacy();', ' // MUTANT: ordinary objects enter the optimized selector'],
 ];
 for(const [name,from,to] of changes){assert.equal(source.split(from).length,2);writeFileSync(path,source.replace(from,to));const run=spawnSync(process.execPath,['--test','--experimental-test-isolation=none','tests/free/index-audit-cost/page-selection.test.mjs','tests/free/index-audit-cost/snapshot-boundary.test.mjs','tests/free/index-audit-cost/independent-boundary.test.mjs'],{cwd:directory,encoding:'utf8'}),output=run.stdout+run.stderr;assert.equal(run.status,1,name+' must fail cleanly');const failures=Number(/(?:ℹ|#) fail (\d+)/.exec(output)?.[1]);assert(failures>0,name+' must be killed by an assertion');reports.push({name,status:'KILLED',exitCode:run.status,failedTests:failures});}
 writeFileSync(path,source);
 const patchPath=join(directory,'tests/free/index-audit-cost/integration.patch'),patchSource=readFileSync(patchPath,'utf8');
 const proofChanges=[
  ['private-root-proof','if(!rootSnapshots.has(root)||rootSnapshots.get(root)!==root.scopeKey)return false;','if(false)return false;'],
  ['private-piece-proof','if(!indexSnapshots.has(record))return false;','if(false)return false;'],
  ['private-context-binding','return !!pointer&&indexSnapshots.get(record)===JSON.stringify([root.scopeKey,piece.kind,piece.bucket,pointer.revision,pointer.count]);','return !!pointer&&indexSnapshots.has(record);'],
 ];
 for(const [name,from,to] of proofChanges){assert.equal(patchSource.split(from).length,2);let changed=patchSource.replace(from,to);if(name==='private-piece-proof')changed=changed.replace('return !!pointer&&indexSnapshots.get(record)===JSON.stringify([root.scopeKey,piece.kind,piece.bucket,pointer.revision,pointer.count]);','return !!pointer;');writeFileSync(patchPath,changed);const run=spawnSync(process.execPath,['--test','tests/free/index-audit-cost/snapshot-boundary.test.mjs'],{cwd:directory,encoding:'utf8'}),output=run.stdout+run.stderr;assert.equal(run.status,1,name+' must fail cleanly');assert(!output.includes('owner source must match either side'),'mutant must reach behavioral assertions');const failures=Number(/(?:ℹ|#) fail (\d+)/.exec(output)?.[1]);assert(failures>0,name+' must be killed by an assertion');reports.push({name,status:'KILLED',exitCode:run.status,failedTests:failures});}
 const report={kind:'PRECISE_HELPER_MUTATIONS_NOT_BROWSER_ACCEPTANCE',reports};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{rmSync(directory,{recursive:true,force:true});}
