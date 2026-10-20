import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const cli=fileURLToPath(new URL('../../extension/package.mjs',import.meta.url));
function root(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-package-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
const run=(cwd,args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:30000});
function snapshot(dir){return Object.fromEntries(readdirSync(dir,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const p=join(e.parentPath??e.path,e.name);return [p.slice(dir.length),createHash('sha256').update(readFileSync(p)).digest('hex')];}));}
test('help and invalid CLI arguments never create a package or treat flags as paths',t=>{
 const dir=root(t),help=run(dir,['--help']);assert.equal(help.status,0);assert.match(help.stdout,/--verify/);assert.deepEqual(readdirSync(dir),[]);
 for(const args of [[],['--unknown'],['--verify'],['--verify','--help'],['--help','extra'],['output','extra'],['--verify','missing','extra']]){const r=run(dir,args);assert.notEqual(r.status,0,JSON.stringify(args));assert.deepEqual(readdirSync(dir),[],JSON.stringify(args));}
});
test('original build and explicit verify support spaces; verify is read-only and refuses damage',t=>{
 const dir=root(t),output=join(dir,'package with spaces'),built=run(dir,[output]);assert.equal(built.status,0,built.stderr);const info=JSON.parse(built.stdout);assert.equal(info.releaseStatus,'NOT_RELEASE_READY');const before=snapshot(output);
 const verified=run(dir,['--verify',info.unpacked]);assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).releaseStatus,'NOT_RELEASE_READY');assert.deepEqual(snapshot(output),before);
 assert.notEqual(run(dir,[output]).status,0);assert.deepEqual(snapshot(output),before);
 const missing=join(dir,'missing');assert.notEqual(run(dir,['--verify',missing]).status,0);assert.equal(existsSync(missing),false);
 const target=join(info.unpacked,'README.txt');writeFileSync(target,readFileSync(target,'utf8')+'tampered');const damaged=snapshot(output);const rejected=run(dir,['--verify',info.unpacked]);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/host-package-hash-mismatch/);assert.deepEqual(snapshot(output),damaged);
});
