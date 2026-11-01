import test from 'node:test';
import vm from 'node:vm';
import {bundle} from '../../simulator/build.mjs';
// ESM tolerates dependency cycles that the extension's small static compiler
// does not. Exercise its actual factory evaluation, not just JS syntax.
for(const entry of ['src/data/shared-ref-directory.mjs','src/data/partitioned.mjs'])test('extension bundle loads without cyclic initialization: '+entry,()=>{
 vm.runInNewContext(bundle(entry),{TextEncoder},{timeout:2000});
});
