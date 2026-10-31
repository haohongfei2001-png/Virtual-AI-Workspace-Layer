import assert from 'node:assert/strict';
/** Scheme B private UI must be a visible document-flow member, not a popover. */
export function nativeEntryWorkspaceReady(allowReturn=false){
 const node=document.querySelector('[data-va-owned][id$="_workspace"]');
 if(node&&!node.hasAttribute('popover')){
  const box=node.getBoundingClientRect(),style=getComputedStyle(node);
  if(style.display!=='none'&&style.visibility==='visible'&&box.width>=160&&box.height>=96&&node.querySelector('iframe'))return true;
 }
 if(!allowReturn)return false;
 return [...document.querySelectorAll('button[aria-label="返回工作空间"]')].some(button=>{
  const box=button.getBoundingClientRect(),style=getComputedStyle(button);
  return style.display!=='none'&&style.visibility==='visible'&&box.width>0&&box.height>0;
 });
}
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
