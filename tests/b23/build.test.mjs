import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../simulator/build.mjs';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
test('B23 packed worker graph resolves all local dependencies and has no test database fallback',()=>{
 const out=join(mkdtempSync(join(tmpdir(),'b23-graph-')),'extension');build(out);const seen=new Set();
 function inspect(path){if(seen.has(path))return;seen.add(path);assert(existsSync(path),path);const text=readFileSync(path,'utf8');assert(!/MockIDBFactory|mock-idb|opaque-entry/.test(text),'test code in worker');for(const m of text.matchAll(/^import\s+[^;]+?\s+from\s*['"]([^'"]+)['"]/gm)){assert(m[1].startsWith('.'),'external worker dependency');inspect(resolve(dirname(path),m[1]));}}
 inspect(join(out,'simulator/worker.mjs'));assert(seen.has(join(out,'src/navigation/projection.mjs')));assert(!readFileSync(join(out,'content.js'),'utf8').includes('MockIDBFactory'));
});

test('legacy B1 fixture build preserves its entry ABI and resolves new shared dependencies',async()=>{
 const {execFileSync}=await import('node:child_process');
 const path=join(mkdtempSync('/tmp/vaiwl-b1-b23-test-'),'fixture');
 execFileSync('node',['experiments/b1/fixture/build.mjs',path]);
 const seen=new Set();function visit(p){if(seen.has(p))return;seen.add(p);assert(existsSync(p),p);const s=readFileSync(p,'utf8');for(const m of s.matchAll(/(?:import\s+[^;]+?|export\s+\*)\s+from\s*['"]([^'"]+)['"]/g))visit(resolve(dirname(p),m[1]));}
 visit(join(path,'worker.mjs'));assert(seen.has(join(path,'src/data/schema.mjs')));assert(seen.has(join(path,'src/navigation/projection.mjs')));
});
