import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const denyBrowserImports='data:text/javascript,'+encodeURIComponent(`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,nextResolve){if(/playwright|puppeteer/.test(specifier))throw Error('BROWSER_DEPENDENCY_UNAVAILABLE');return nextResolve(specifier,context);}});`);
test('entry calibration mutation reaches the actual classic runtime bundle and retains bootstrap bytes with browser dependencies unavailable',()=>{
 const result=JSON.parse(execFileSync(process.execPath,['--import',denyBrowserImports,fileURLToPath(new URL('./entry-calibration-package.mjs',import.meta.url)),'--contract'],{encoding:'utf8'}));
 assert.equal(result.status,'PASS');assert.equal(result.evidence,'NODE_ACTUAL_CLASSIC_MUTATION_BUILD');assert.equal(result.runtimeChanged,true);
});

test('missing browser dependency guard actually rejects attempted resolution',()=>{
 const result=spawnSync(process.execPath,['--import',denyBrowserImports,'--input-type=module','--eval',"await import('playwright');"],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/BROWSER_DEPENDENCY_UNAVAILABLE/);
});
