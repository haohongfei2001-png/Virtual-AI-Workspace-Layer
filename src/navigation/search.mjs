/** Known derived names and explicitly saved excerpts; never the native search index. */
export function knownMatches(snapshot,query,workspaceId=null){
 if(snapshot.viewMode==='free'){snapshot={...snapshot,refs:snapshot.refs.map(r=>({...r,displayTitle:r.nativeTitle??'名称暂不可用',aliases:r.nativeAliases??[]})),groups:(snapshot.groups??snapshot.themes??[]).map(g=>({...g,name:g.nativeName??'名称暂不可用',aliases:g.nativeAliases??[]}))};}
 const q=query.trim().toLocaleLowerCase(),groups=snapshot.groups??snapshot.themes,theme=groups.find(g=>g.id===workspaceId),allowed=workspaceId?new Set(theme?.members??[]):null;
 const themeMatches=new Set();for(const g of groups)if((g.name+' '+(g.aliases??[]).join(' ')).toLocaleLowerCase().includes(q))for(const id of g.members)themeMatches.add(id);
 const found=snapshot.refs.filter(r=>(!allowed||allowed.has(r.id))&&([(r.nativeTitle??''),(r.displayTitle??''),r.id,...(r.aliases??[])].join(' ').toLocaleLowerCase().includes(q)||themeMatches.has(r.id)));
 const byId=new Map(snapshot.refs.map(r=>[r.id,r]));for(const snippet of snapshot.preferences?.savedSnippets?.value??[]){const ref=byId.get(snippet.refId);if(ref&&(!allowed||allowed.has(ref.id))&&snippet.text.toLocaleLowerCase().includes(q))found.push({...ref,anchor:snippet});}
 return found;
}

/** Native project identity is searchable even before any member is known.
 * Keep this separate from conversation matches so Pro search and snippet anchors
 * retain their existing semantics. A missing member is never evidence of NONE. */
export function knownProjectMatches(snapshot,query,projectId=null){
 if(snapshot.viewMode!=='free')return [];
 const q=query.trim().toLocaleLowerCase();
 return (snapshot.groups??snapshot.themes??[]).filter(g=>(projectId===null||g.id===projectId)&&[g.nativeName??'',...(g.nativeAliases??[])].join(' ').toLocaleLowerCase().includes(q));
}

/** Validate only the additive project variant; legacy conversation rows retain
 * their existing contract. Identity keys include kind, never title or raw ID alone. */
export function searchProjectMap(items=[],groups=[]){
 const projects=new Map(groups.map(g=>[g.id,g])),seen=new Set();
 for(const row of items){
  if(row?.kind===undefined)continue;
  if(row.kind!=='project'||Object.getPrototypeOf(row)!==Object.prototype||Reflect.ownKeys(row).sort().join(',')!=='available,freshness,id,kind,nativeName,nativeUrl'||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(row.id)||['__proto__','constructor','prototype'].includes(row.id)||!(row.nativeName===null||typeof row.nativeName==='string'&&row.nativeName.length<=512)||!(row.nativeUrl===null||typeof row.nativeUrl==='string'&&row.nativeUrl.length<=2048)||typeof row.available!=='boolean'||typeof row.freshness!=='string'||seen.has(row.id))throw Error('invalid-frame-search-project');
  const prior=projects.get(row.id);if(prior&&(prior.nativeUrl!==row.nativeUrl||prior.nativeName!==row.nativeName))throw Error('conflicting-frame-search-project');
  seen.add(row.id);projects.set(row.id,row);
 }
 return projects;
}
