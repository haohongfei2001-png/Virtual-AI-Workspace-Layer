/** Continue only explicit, distinct preparation stages; never publish partial inventory. */
export async function loadFreeHeader({load,scope,guard=()=>true}){
  if(typeof load!=='function'||typeof scope!=='function'||typeof guard!=='function')throw Error('invalid-free-header-loader');
  const stages=['native-bootstrap','native-index','shared-directory','evidence-directory'],seen=new Set(),boundScope=scope();let last=-1;
  if(typeof boundScope!=='string'||!boundScope)throw Error('stale-client-response');
  const check=()=>{if(!guard())throw Error('stale-client-response');};
  for(let attempt=0;attempt<=stages.length;attempt++){
    check();const reply=await load();check();
    if(!reply?.ok)throw Error(reply?.reason??'read-failed');
    const header=reply.header,currentScope=scope();
    if(boundScope!==currentScope)throw Error('stale-client-response');
    if(!header||typeof header!=='object')throw Error('invalid-free-header');
    if(!Object.hasOwn(header,'preparing')){if(header.scope!==boundScope)throw Error('stale-client-response');return reply;}
    const value=header.preparing,index=stages.indexOf(value?.stage);
    if(Object.keys(header).length!==1||!value||Object.keys(value).length!==2||value.scope!==boundScope||index<0)throw Error('invalid-free-header-preparation');
    if(seen.has(value.stage)||index<=last)throw Error('free-header-preparation-no-progress');
    seen.add(value.stage);last=index;
  }
  throw Error('free-header-preparation-budget');
}
