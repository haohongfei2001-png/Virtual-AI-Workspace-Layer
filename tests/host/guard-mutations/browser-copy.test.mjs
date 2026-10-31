import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
// Execute the runner's actual copy function without invoking a browser runner.
const source=readFileSync(join(repository,'tests/host/guard-mutations-browser.runner.mjs'),'utf8');
const start=source.indexOf('function copy(target){'),end=source.indexOf('\nfunction run(',start);
assert(start>=0&&end>start);const copySource=source.slice(start,end);
function fixture(t,{playwright=true,esbuild=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'guard-browser-copy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const root=join(dir,'source'),target=join(dir,'copy');
 for(const path of ['src','extension/tooling','simulator','tests/b1/tooling','src/nested/node_modules'])mkdirSync(join(root,path),{recursive:true});
 writeFileSync(join(root,'src/fixture.mjs'),'export const fixture=1;');writeFileSync(join(root,'src/nested/node_modules/omit'),'do not copy');
 writeFileSync(join(root,'extension/tooling/package.json'),'{}');
 if(playwright)mkdirSync(join(root,'tests/b1/tooling/node_modules'));
 if(esbuild)symlinkSync(join(repository,'extension/tooling/node_modules'),join(root,'extension/tooling/node_modules'),'dir');
 const context=vm.createContext({root,mkdirSync,cpSync,join,existsSync,symlinkSync});vm.runInContext(copySource+';globalThis.copy=copy;',context);
 return {root,target,copy:()=>context.copy(target)};
}
test('actual runner copy links both existing dependency trees and resolves pinned esbuild without copying dependencies',t=>{
 const f=fixture(t);f.copy();
 for(const path of ['tests/b1/tooling/node_modules','extension/tooling/node_modules']){assert(lstatSync(join(f.target,path)).isSymbolicLink());assert.equal(realpathSync(join(f.target,path)),realpathSync(join(f.root,path)));}
 assert(!existsSync(join(f.target,'src/nested/node_modules')));assert.equal(readFileSync(join(f.target,'src/fixture.mjs'),'utf8'),'export const fixture=1;');
 const localRequire=createRequire(join(f.target,'extension/tooling/package.json')),esbuild=localRequire('esbuild');assert.equal(esbuild.version,'0.25.12');
 const result=esbuild.buildSync({stdin:{contents:'globalThis.__copyDependencyProbe=1;'},bundle:true,write:false,format:'iife',platform:'browser'});assert(result.outputFiles[0].text.includes('__copyDependencyProbe'));
});
for(const [missing,code]of [['playwright','preinstalled-playwright-required'],['esbuild','preinstalled-esbuild-required']])test('actual runner copy fails closed when '+missing+' dependency is absent',t=>{
 const f=fixture(t,{[missing]:false});assert.throws(f.copy,new RegExp(code));assert(existsSync(join(f.root,'src/fixture.mjs')));
});
