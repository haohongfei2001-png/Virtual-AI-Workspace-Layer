/** Bounded read-only refinement; never split errors that are not byte-size limits. */
export async function loadFreePages({requests,load,guard=()=>true}){
 if(!Array.isArray(requests)||typeof load!=='function'||typeof guard!=='function')throw Error('invalid-free-page-loader');
 const pages=[];let splits=0;
 const check=()=>{if(!guard())throw Error('stale-client-response');};
 async function visit(ids,depth=0){
  check();const result=await load(ids);check();
  if(result?.ok){pages.push(result.page);return;}
  const reason=result?.reason??'read-failed';
  if(!['native-page-too-large','free-evidence-page-too-large','free-page-too-large'].includes(reason))throw Error(reason);
  const count=ids.projects.length+ids.refs.length;
  if(count<=1)throw Error('free-single-item-too-large');
  if(depth>=13||splits>=64)throw Error('free-page-split-budget');splits++;
  const cut=Math.floor(count/2),projects=ids.projects,refs=ids.refs;
  const left={projects:projects.slice(0,cut),refs:refs.slice(0,Math.max(0,cut-projects.length))};
  const right={projects:projects.slice(cut),refs:refs.slice(Math.max(0,cut-projects.length))};
  await visit(left,depth+1);await visit(right,depth+1);
 }
 for(const ids of requests){
  if(!ids||!Array.isArray(ids.projects)||!Array.isArray(ids.refs)||ids.projects.length+ids.refs.length>5000||ids.projects.length+ids.refs.length<1)throw Error('invalid-free-page-request');
  await visit(ids);
 }
 return pages;
}
