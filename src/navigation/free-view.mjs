/** Adapt native facts to the existing visual shell, without importing Pro identities. */
export function freeNavigationSnapshot(snapshot) {
  if(snapshot.viewMode!=='free'||!snapshot.scope)throw Error('invalid-free-snapshot');
  const refs=snapshot.refs.map(r=>{if(r.scope!==snapshot.scope)throw Error('cross-scope-free-view');return {...r,displayTitle:r.nativeTitle??'名称暂不可用',aliases:r.nativeAliases??[]};});
  const byId=new Map(refs.map(r=>[r.id,r]));
  const decision=r=>r.activityDecision??r.activity??{};
  const groups=snapshot.projects.map(p=>{
    if(p.scope!==snapshot.scope)throw Error('cross-scope-free-project');
    const rows=p.members.map(r=>byId.get(typeof r==='string'?r:r.id)).filter(Boolean);
    const segment=decision(p).segment??null,current=[],old=[],unknown=[];
    for(const r of rows){const own=decision(r).segment;if(own===null||own===undefined)unknown.push(r);else if(segment!==null&&own>segment)old.push(r);else current.push(r);}
    return {...p,name:p.nativeName??'名称暂不可用',members:rows.map(r=>r.id),aliases:p.nativeAliases??[],segment,current,old,unknown};
  });
  return {...snapshot,refs,groups,themes:groups,noProject:(snapshot.noProject??refs.filter(r=>r.membership==='NONE')).map(r=>byId.get(r.id)).filter(Boolean),unknown:(snapshot.unknown??refs.filter(r=>r.membership==='UNKNOWN')).map(r=>byId.get(r.id)).filter(Boolean)};
}
export function freeListRows(snapshot,kind,segment){
  return (snapshot[kind]??[]).filter(r=>{const k=(r.activityDecision??r.activity)?.segment??null;return k===segment||(k===null&&segment===0);});
}
