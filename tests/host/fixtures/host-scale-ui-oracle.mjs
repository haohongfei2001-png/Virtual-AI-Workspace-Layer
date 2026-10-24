/** Independent fixture contract, not production search/sort or world-generator code. */
export function checkHostScaleSearchPage({rows,size,query,longTitles=true,expectedCount=24,excludedIds=[]}){
 if(![1000,10000,100000].includes(size)||typeof query!=='string'||!query.trim()||typeof longTitles!=='boolean'||![1,24].includes(expectedCount))throw Error('invalid-scale-ui-oracle-input');
 if(!Array.isArray(rows)||rows.length!==expectedCount)throw Error('scale-ui-page-cardinality');
 const ids=new Set(),excluded=new Set(excludedIds),needle=query.toLowerCase();
 for(const row of rows){
  const match=typeof row?.id==='string'&&/^60000000-0000-4000-8000-([0-9a-f]{12})$/.exec(row.id),index=match?Number.parseInt(match[1],16):-1;
  if(index<0||index>=size)throw Error('scale-ui-foreign-id');
  if(ids.has(row.id))throw Error('scale-ui-duplicate-id');if(excluded.has(row.id))throw Error('scale-ui-page-overlap');ids.add(row.id);
  const title='原生压力聊天 '+String(index).padStart(6,'0')+(longTitles?' · 长中文标题与 English mixed 内容用于尾部原名检索及实际可达验证，不代表真实聊天。':'');
  if(row.title!==title)throw Error('scale-ui-original-title-mismatch');
  if(!title.toLowerCase().includes(needle))throw Error('scale-ui-query-mismatch');
 }
 return [...ids];
}
