import assert from 'node:assert/strict';
export const exampleTargets=Object.freeze(['assistant','code','third-party'].flatMap((region,i)=>[
 {region,entity:'project',id:`g-p-${String(900+i).padStart(32,'0')}`},
 {region,entity:'conversation',id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(900+i).padStart(12,'0')}`},
]));
export function assertExamplesExcluded({before,after,witnessId,witnessTitle}){
 assert(after.revision>before.revision,'must witness a processed native scan, not merely immediate absence');
 assert.equal(after.refs[witnessId]?.nativeTitle,witnessTitle,'legitimate native region must still update');
 for(const row of exampleTargets)assert(!Object.hasOwn(row.entity==='project'?after.projects:after.refs,row.id),`${row.region} example entered native inventory`);
 assert.deepEqual(Object.keys(after.projects).sort(),Object.keys(before.projects).sort());
 assert.deepEqual(Object.keys(after.refs).sort(),Object.keys(before.refs).sort());
}
export function assertCancelUnchanged({before,after,beforeIds,afterIds}){
 assert.equal(after.projectCount,before.projectCount,'cancel created native project');
 assert.equal(after.actions['create-project']??0,before.actions['create-project']??0);
 assert.deepEqual([...afterIds].sort(),[...beforeIds].sort(),'cancel manufactured inventory card');
}
export function assertNativeScope({projectId,projectRequest,globalRequest,projectPath,globalPath,createdBefore,createdAfter}){
 assert.equal(projectRequest.kind,'new-project-chat');assert.equal(projectRequest.projectId,projectId);
 assert.match(projectPath,/^\/c\/[a-f0-9-]+$/);
 assert.equal(globalRequest.kind,'new-chat');assert.equal(globalRequest.path,'/');assert.equal(globalPath,'/');
 assert.equal(createdAfter,createdBefore,'global new chat must not create a project-scoped saved conversation');
}

/** Both independent surface masks must release before native sidebar actions. */
export async function restoreNativeEntrySurfaces(page){
 for(const name of ['返回原生阅读','显示原生列表']){const close=page.getByRole('button',{name,exact:true});if(await close.isVisible())await close.click();}
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:15000});
}
