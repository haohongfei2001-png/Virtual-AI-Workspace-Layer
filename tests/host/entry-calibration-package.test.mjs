import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('entry calibration mutation reaches the actual classic runtime bundle and retains bootstrap bytes',()=>{
 const result=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./entry-calibration-package.mjs',import.meta.url)),'--contract'],{encoding:'utf8'}));
 assert.equal(result.status,'PASS');assert.equal(result.evidence,'NODE_ACTUAL_CLASSIC_MUTATION_BUILD');assert.equal(result.runtimeChanged,true);
});
