import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createSys02PendingCases} from './sys02-pending-idb-cases.mjs';
// Portable-case sanity only. This runner never counts as native IDB D/S.
for(const item of createSys02PendingCases(new MockIDBFactory()))test('MOCK_PORTABILITY_ONLY '+item.name,item.run);

import assert from 'node:assert/strict';
import {buildSys02Package} from './sys02-pending-idb-browser.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
test('package candidate has byte-identical portable closure and no network/host permission',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sys02-package-check-')),{sourceHashes,manifest,moduleCount}=await buildSys02Package(directory);
 assert(moduleCount>1);assert.equal(manifest.manifest_version,3);assert.equal(manifest.permissions,undefined);assert.equal(manifest.host_permissions,undefined);assert.match(manifest.content_security_policy.extension_pages,/connect-src 'none'/);
 for(const [path,expected] of Object.entries(sourceHashes)){
  if(path.endsWith('sys02-pending-idb-browser.mjs'))continue; // Node orchestration stays outside extension.
  assert(!path.includes('mock-idb'));const source=await readFile(join(directory,path));assert.equal(createHash('sha256').update(source).digest('hex'),expected);
  assert(!/from\s*['"]node:/.test(source.toString()));
 }
});
