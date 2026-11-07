/** Small precise mutations in owned temporary source copies, never the input tree. */
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url)),directory=mkdtempSync(join(tmpdir(),'vaiwl-ingestion-mutants-'));
const changes=[
 ['disable-noop','src/runtime/host-observation-owner.mjs','if(!combined&&!nativeChanged&&!revalidating){','if(false&&!combined&&!nativeChanged&&!revalidating){','fresh identical PROJECT rescan'],
 ['ignore-semantic-change','src/runtime/host-observation-owner.mjs','if(!combined&&!nativeChanged&&!revalidating){','if(!combined&&!revalidating){','one real native rename'],
 ['ignore-witness-expiry','src/runtime/host-observation-owner.mjs','if(witnessed())','if(true)','expired witnesses'],
 ['reuse-revoked-incarnation','src/runtime/native-source-incarnation.mjs','if(source.revoked===false)return','if(true)return','source revocation needs'],
 ['ignore-revision-fence','src/runtime/host-observation-owner.mjs','if(revision!==page.revision)return','if(false&&revision!==page.revision)return','changed revision at no-op'],
 ['eager-prefix-probe','tests/host/ingestion-cost/fixture.mjs','for(const payload of proposals()){','for(const payload of [...proposals()]){','finite history prefix'],
];
const reports=[];
try{for(const name of ['src','tests'])cpSync(join(root,name),join(directory,name),{recursive:true});
 for(const [name,path,from,to,pattern]of changes){const target=join(directory,path),source=readFileSync(target,'utf8'),matches=source.split(from).length-1;assert.equal(matches,name==='ignore-witness-expiry'?2:1,name+' exact marker');writeFileSync(target,source.replaceAll(from,to));
  const run=spawnSync(process.execPath,['--test','--test-name-pattern',pattern,'tests/host/ingestion-cost/write-causes.test.mjs'],{cwd:directory,encoding:'utf8'}),output=run.stdout+run.stderr;
  writeFileSync(target,source);assert.equal(run.status,1,name+' must fail');const failed=Number(/(?:ℹ|#) fail (\d+)/.exec(output)?.[1]);assert.equal(failed,1,name+' must fail one selected behavioral test');assert(!output.includes('SyntaxError')&&!output.includes('ERR_MODULE_NOT_FOUND'));reports.push({name,status:'KILLED',selectedTests:1,failedTests:failed});
 }
 const report={kind:'L_ONLY_TARGETED_MUTATION_CHECKS',reports};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{rmSync(directory,{recursive:true,force:true});}
