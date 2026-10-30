import assert from 'node:assert/strict';
// All fields belong to the first enabled synchronous DOM snapshot. A later
// task may correctly retire its capability; never splice that task's row in.
export function assertRecoveryNativeLinkSample(sample,ref){
 assert(sample,'repaired UNKNOWN link must become usable within six seconds');
 assert.equal(sample.count,1);assert.equal(sample.ownerDocument,true);assert.equal(sample.connected,true);assert.equal(sample.visible,true);
 assert.equal(sample.refId,ref.id);assert.equal(sample.list,'unknown');
 assert.equal(sample.href,ref.nativeUrl);assert.notEqual(sample.ariaDisabled,'true');assert.equal(sample.containsProTitle,false);
}
