/** Known derived names and explicitly saved excerpts; never the native search index. */
export function knownMatches(snapshot,query,workspaceId=null){
 if(snapshot.viewMode==='free'){snapshot={...snapshot,refs:snapshot.refs.map(r=>({...r,displayTitle:r.nativeTitle??'名称暂不可用',aliases:[]}))};}
 const q=query.trim().toLocaleLowerCase(),groups=snapshot.groups??snapshot.themes,theme=groups.find(g=>g.id===workspaceId),allowed=workspaceId?new Set(theme?.members??[]):null;
 const themeMatches=new Set();for(const g of groups)if((g.name+' '+(g.aliases??[]).join(' ')).toLocaleLowerCase().includes(q))for(const id of g.members)themeMatches.add(id);
 const found=snapshot.refs.filter(r=>(!allowed||allowed.has(r.id))&&([(r.nativeTitle??''),(r.displayTitle??''),r.id,...(r.aliases??[])].join(' ').toLocaleLowerCase().includes(q)||themeMatches.has(r.id)));
 const byId=new Map(snapshot.refs.map(r=>[r.id,r]));for(const snippet of snapshot.preferences?.savedSnippets?.value??[]){const ref=byId.get(snippet.refId);if(ref&&(!allowed||allowed.has(ref.id))&&snippet.text.toLocaleLowerCase().includes(q))found.push({...ref,anchor:snippet});}
 return found;
}
