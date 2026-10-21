import assert from 'node:assert/strict';
/** Follow the production target, never retarget the anchor or synthesize a goto. */
export async function openEvidenceProjectPage({context,sourcePage,link,projectURL,onPageError}){
 assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('href'),projectURL);
 const sourceURL=sourcePage.url();const [opened]=await Promise.all([context.waitForEvent('page'),link.click()]);
 assert.notEqual(opened,sourcePage);opened.on('pageerror',onPageError);await opened.waitForURL(projectURL);assert.equal(sourcePage.url(),sourceURL,'external project action must not replace original conversation');return opened;
}
export async function verifyEvidencePackage({verify,readManifest,initialManifestHash,hash}){
 const result=await verify();assert.equal(result.status,'OFFLINE_HOST_RECONSTRUCTION');const finalHash=hash(await readManifest());assert.equal(finalHash,initialManifestHash,'built manifest changed');return {status:result.status,buildManifestHash:finalHash,buildManifestUnchanged:true};
}
