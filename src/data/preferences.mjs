export const preferenceIds=['sidebarVisible','compactRows','workingSet','savedSnippets'];
/** Manual, scoped reference metadata only. No drafts, model state or executable authorization. */
export function validatePreference(p,state,checks){const {exact,id,text}=checks;
 if(!preferenceIds.includes(p.id))throw Error('invalid-preference');
 if(['sidebarVisible','compactRows'].includes(p.id)){if(typeof p.value!=='boolean')throw Error('invalid-boolean');return;}
 const ref=r=>{id(r);if(!Object.hasOwn(state.refs,r))throw Error('orphan-preference-ref');};
 if(p.id==='workingSet'){exact(p.value,['refs','current']);const v=p.value;if(!Array.isArray(v.refs)||v.refs.length>1000||new Set(v.refs).size!==v.refs.length)throw Error('invalid-working-set');v.refs.forEach(ref);if(v.current!==null&&!v.refs.includes(v.current))throw Error('invalid-working-set-current');return;}
 if(!Array.isArray(p.value)||p.value.length>100||new Set(p.value.map(s=>s.id)).size!==p.value.length)throw Error('snippet-capacity');
 for(const s of p.value){exact(s,['id','refId','messageId','branchId','text','bodyHash']);id(s.id);ref(s.refId);id(s.messageId);id(s.branchId);text(s.text,2000);if(typeof s.bodyHash!=='string'||!/^[a-f0-9]{64}$/.test(s.bodyHash))throw Error('invalid-snippet-anchor');}
}
