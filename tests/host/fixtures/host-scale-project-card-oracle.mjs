/** Independent rendered-card oracle. No production projection or fixture generator imports.
 * A card's opaque display ID is never proof of native Project identity. */
export function checkHostScaleProjectCard({card,expectedProjectId,size,nativeOrigin,longTitles=true,distribution='single-project',previousIds=[]}){
 if(![1000,10000,100000].includes(size)||typeof longTitles!=='boolean'||!['single-project','project-mixed','none-heavy'].includes(distribution)||!Array.isArray(previousIds))throw Error('invalid-scale-card-oracle-input');
 let origin;try{origin=new URL(nativeOrigin);}catch{throw Error('invalid-scale-card-origin');}
 if(origin.origin!==nativeOrigin||!['http:','https:'].includes(origin.protocol))throw Error('invalid-scale-card-origin');
 const projectMatch=typeof expectedProjectId==='string'&&/^g-p-([0-9a-f]{32})$/.exec(expectedProjectId),ordinal=projectMatch?Number.parseInt(projectMatch[1],16):NaN;
 if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>(distribution==='single-project'?1:size/100))throw Error('invalid-scale-card-project');
 if(!card||card.name!=='原生项目 '+(ordinal-1))throw Error('scale-card-native-name-mismatch');
 if(card.createHref!==nativeOrigin+'/g/'+expectedProjectId+'/project')throw Error('scale-card-native-project-link-mismatch');
 if(!Array.isArray(card.rows)||card.rows.length<1)throw Error('scale-card-empty-members');
 const ids=[],seen=new Set();
 for(const row of card.rows){
  const match=typeof row?.id==='string'&&/^60000000-0000-4000-8000-([0-9a-f]{12})$/.exec(row.id),index=match?Number.parseInt(match[1],16):-1;
  if(index<0||index>=size)throw Error('scale-card-foreign-ref');
  const grouped=distribution==='single-project'||(distribution==='project-mixed'?index%5!==4:index%10===0),projectOrdinal=distribution==='single-project'?1:Math.floor(index/100)+1;
  if(!grouped||projectOrdinal!==ordinal)throw Error('scale-card-wrong-project-member');
  if(seen.has(row.id))throw Error('scale-card-duplicate-ref');seen.add(row.id);ids.push(row.id);
  const title='原生压力聊天 '+String(index).padStart(6,'0')+(longTitles?' · 长中文标题与 English mixed 内容用于尾部原名检索及实际可达验证，不代表真实聊天。':'');
  if(row.title!==title)throw Error('scale-card-native-title-mismatch');
  if(row.href!==nativeOrigin+'/c/'+row.id)throw Error('scale-card-native-conversation-link-mismatch');
 }
 if(previousIds.length){
  if(new Set(previousIds).size!==previousIds.length||previousIds.some(id=>typeof id!=='string'))throw Error('invalid-scale-card-previous-ids');
  if(ids.length<=previousIds.length||previousIds.some((id,index)=>ids[index]!==id))throw Error('scale-card-expansion-did-not-preserve-prefix');
 }
 return ids;
}
