import assert from 'node:assert/strict';
/** Test-runner orchestration only. Actual management operations and native
 * invariants are supplied by the continuous packaged journey, not simulated. */
export async function repeatJ4Reenable({setEnabled,closeProbe,inspectPrimary,inspectPeer,readAssets,expectedAssets,record}){
 const results=[];
 for(let cycle=1;cycle<=2;cycle++){
  await closeProbe();
  const disabled=await setEnabled(false);assert.equal(disabled.enabled,false);
  const disabledPrimary=await inspectPrimary(`_CYCLE${cycle}_OFF`);
  const disabledPeer=await inspectPeer(`_CYCLE${cycle}_OFF`);
  const enabled=await setEnabled(true);assert.equal(enabled.enabled,true);assert.equal(enabled.id,disabled.id);
  const enabledPrimary=await inspectPrimary(`_CYCLE${cycle}_ON`);
  const enabledPeer=await inspectPeer(`_CYCLE${cycle}_ON`);
  const assets=await readAssets();assert.deepEqual(assets,expectedAssets);
  const result={cycle,disabledPrimary,disabledPeer,enabledPrimary,enabledPeer,assetDigest:assets.hash};
  results.push(result);record('repeated-actual-disable-reenable-preserves-two-unrefreshed-native-documents',result);
 }
 return results;
}
