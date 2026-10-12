import { iconNames, svgIcon } from '../src/navigation/icons.mjs';
import { editorCSS } from './editor-style.mjs';
const randomId=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
/** C1 manual editor reusing B3 commands and B4 draft/CAS protection. Own dialog, never a native title editor. */
export function openWorkspaceEditor({snapshot,command,undo,assets=null,context={},onClose=()=>{}}){
  let suspended=false,disposed=false,ignoredCloses=0,priorFocus=null;const scope=snapshot.scope,dirty=new Map();
  const read=input=>input.type==='checkbox'?input.checked:input.value;
  const dialog=document.createElement('dialog');dialog.dataset.vaiwlOwned='workspace-editor';dialog.setAttribute('aria-label','工作空间管理');
  const node=(tag,label)=>{const n=document.createElement(tag);if(label)n.textContent=label;return n;};
  const style=node('style');style.textContent=editorCSS;dialog.append(style);const heading=node('h2','整理工作空间');dialog.append(heading,node('p','为主题和窗口设置名称、图标与顺序。修改只保存在工作空间中。'));
  const warning=node('p');warning.dataset.vaiwlDiagnostic='view';dialog.append(warning);
  const status=node('p');status.setAttribute('role','status');dialog.append(status);
  let section=dialog;function group(title,details=false,open=true){section=node(details?'details':'section');section.className='edit-section';if(details)section.open=open;section.append(node(details?'summary':'h3',title));dialog.append(section);return section;}
  const field=(label,tag='input')=>{const wrap=node('label',label+' '),input=node(tag);input.setAttribute('aria-label',label);if(tag!=='select'){const edited=()=>dirty.set(input,{revision:dirty.get(input)?.revision??snapshot.revision,value:read(input)});input.addEventListener('input',edited);input.addEventListener('change',edited);}wrap.append(input);section.append(wrap);return input;};
  const action=(label,run,success='已保存到派生工作空间。')=>{const b=node('button',label);b.type='button';if(['保存主题','保存派生标题','创建主题'].includes(label))b.className='primary';b.onclick=async()=>{b.disabled=true;status.textContent='正在保存…';try{await run();populate();status.textContent=success;}catch(e){status.textContent=e.message==='revision-conflict'?('另一标签页已修改；草稿已保留。最新保存标题：'+(snapshot.refs.find(r=>r.id===ref.value)?.displayTitle??'')+'；最新主题名称：'+(snapshot.objects.workspaces[theme.value]?.name??'')+'。核对后再次点击保存。'):e.message==='write-result-unknown'?'保存结果未确认；草稿已保留，重新连接后请核对最新数据。':('未完成：'+e.message);}finally{b.disabled=false;}};section.append(b);return b;};
  async function editCommand(value,fields){
    const chosen=fields.filter(f=>dirty.has(f)),expectedRevision=chosen.length?Math.min(...chosen.map(f=>dirty.get(f).revision)):snapshot.revision;const captured=new Map(fields.map(f=>[f,read(f)]));
    try{const result=await command(value,expectedRevision);for(const f of fields)if(read(f)===captured.get(f))dirty.delete(f);return result;}
    catch(e){if(e.message==='revision-conflict')for(const f of chosen)dirty.get(f).revision=snapshot.revision;throw e;}
  }
  group('新建主题',true,!context.workspaceId);const newName=field('新主题名称');
  action('创建主题',async()=>{const id='W_'+randomId().replaceAll('-','');await editCommand({type:'CREATE_WORKSPACE',id,name:newName.value},[newName]);theme.value=id;populate();});
  group('主题');const theme=field('主题选择','select');
  const name=field('主题名称'),icon=field('主题图标'),order=field('主题顺序'),lock=field('锁定主题');order.type='number';lock.type='checkbox';
  const choices=node('div');choices.className='icon-choices';choices.setAttribute('aria-label','主题图标选项');for(const [kind,label] of Object.entries(iconNames)){const b=node('button');b.type='button';b.setAttribute('aria-label','图标 '+label);b.title=label;b.innerHTML=svgIcon(kind);b.onclick=()=>{icon.value=kind;icon.dispatchEvent(new Event('input'));for(const c of choices.children)c.setAttribute('aria-pressed',String(c===b));};choices.append(b);}section.append(choices);
  action('保存主题',()=>editCommand({type:'UPDATE_WORKSPACE',id:theme.value,name:name.value,icon:icon.value,order:Number(order.value),locked:lock.checked},[name,icon,order,lock]));
  group('窗口');
  const ref=field('窗口选择','select');let referenceLimit=200,referenceQuery='';
  let referenceFilter=null,referenceMore=null;
  if(snapshot.refs.length>20000){
    referenceFilter=field('查找已知窗口');referenceFilter.type='search';
    // Filtering chooses a reference, never marks an asset edit or silently discards a draft.
    referenceFilter.oninput=()=>{dirty.delete(referenceFilter);referenceQuery=referenceFilter.value;referenceLimit=200;refOptions();};
    referenceMore=action('显示更多窗口选项',async()=>{referenceLimit+=200;refOptions();},'已展开更多已知窗口。');
  }
  const title=field('派生标题');
  action('保存派生标题',()=>editCommand({type:'SET_TITLE',refId:ref.value,title:title.value,locked:true},[title]));
  const windowOrder=field('窗口顺序');windowOrder.type='number';
  action('保存窗口顺序',()=>editCommand({type:'PLACE',workspaceId:theme.value,refId:ref.value,order:Number(windowOrder.value)},[windowOrder]));
  const target=field('目标主题','select');
  action('加入窗口',()=>command({type:'PLACE',workspaceId:theme.value,refId:ref.value}));
  action('移动窗口',()=>command({type:'MOVE',refId:ref.value,from:theme.value,to:target.value}));
  action('排除窗口',()=>command({type:'PLACE',workspaceId:theme.value,refId:ref.value,excluded:true}));
  group('工作集与片段',true,false);
  const working=node('div');working.className='working-set-editor';section.append(working);
  action('加入当前工作集',async()=>{const v=snapshot.preferences.workingSet?.value??{refs:[],current:null},refs=[...v.refs];if(!refs.includes(ref.value))refs.push(ref.value);await command({type:'SET_PREFERENCE',id:'workingSet',value:{refs,current:ref.value}});});
  action('从工作集移除所选窗口',async()=>{const v=snapshot.preferences.workingSet?.value??{refs:[],current:null},refs=v.refs.filter(id=>id!==ref.value);await command({type:'SET_PREFERENCE',id:'workingSet',value:{refs,current:refs.includes(v.current)?v.current:refs[0]??null}});});
  action('将所选窗口前移',async()=>{const v=snapshot.preferences.workingSet?.value??{refs:[],current:null},refs=[...v.refs],i=refs.indexOf(ref.value);if(i<=0)throw Error('所选窗口无法前移');[refs[i-1],refs[i]]=[refs[i],refs[i-1]];await command({type:'SET_PREFERENCE',id:'workingSet',value:{...v,refs}});});
  section.append(node('p','工作集只保存引用与顺序，按点击惰性打开；不保存草稿或运行中的任务。可移除失败项，原生修饰键和浏览器返回保持原义。'));
  const snippetNote=node('p',context.snippet?'已取得所选片段的唯一消息与分支锚点。':'在原生消息正文中选择文字，再打开管理；只保存你明确选择的片段。');section.append(snippetNote);
  action('保存所选片段',async()=>{if(!context.snippet)throw Error('请选择一个可唯一定位的消息片段');const v=snapshot.preferences.savedSnippets?.value??[],snippet={...context.snippet,id:'s_'+randomId().replaceAll('-','')};await command({type:'SET_PREFERENCE',id:'savedSnippets',value:[...v,snippet]});context.snippet=null;snippetNote.textContent='片段已保存，可在派生查找中搜索；原生搜索仍独立保留。';});
  action('移除所选窗口片段',()=>command({type:'SET_PREFERENCE',id:'savedSnippets',value:(snapshot.preferences.savedSnippets?.value??[]).filter(s=>s.refId!==ref.value)}));
  group('显示偏好',true);const compact=field('紧凑窗口');compact.type='checkbox';action('保存显示偏好',()=>editCommand({type:'SET_PREFERENCE',id:'compactRows',value:compact.checked},[compact]));
  group('证据管理',true,false);section.append(node('p','撤销来源会重新计算可见记录，不会删除人工修改。')); 
  const sources=field('证据来源','select');action('撤销证据来源',()=>command({type:'REVOKE_SOURCE',sourceId:sources.value}));
  if(assets){group('备份与恢复',true,false);section.append(node('p','备份仅包含工作空间、人工名称、归属和引用；可包含你手工保存的片段，不收集聊天全文、草稿、执行授权或发送证据。恢复保留当前人工修改，先预览再应用。检查点仅用于损坏恢复，不能代替文件备份。'));
    let bundle=null,preview=null;const info=node('p');info.dataset.backupPreview='';section.append(info);
    action('导出工作空间备份',async()=>{const b=await assets.export(),url=URL.createObjectURL(new Blob([JSON.stringify(b,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='vaiwl-workspace-backup.json';dialog.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},'备份文件已交给浏览器下载。');
    const file=field('选择工作空间备份');file.type='file';file.accept='.json,application/json';file.onchange=()=>{bundle=null;preview=null;info.textContent='';};
    action('预览备份恢复',async()=>{const f=file.files?.[0];if(!f||f.size>17*1024*1024)throw Error('请选择有效备份文件（最大17MiB）');bundle=JSON.parse(await f.text());preview=await assets.preview(bundle);info.textContent='新增 '+preview.summary.added+' 项；更新 '+preview.summary.updated+' 项；保留当前人工修改 '+preview.summary.keptHuman+' 项。不会导入发送证据或执行授权。';},'只读预览完成，尚未修改数据。');
    action('应用预览恢复',async()=>{if(!bundle||!preview)throw Error('请先预览备份');await assets.restore(bundle,preview);preview=null;info.textContent='恢复已提交，可通过撤销上次修改安全回滚。';});
    action('检查存储容量',async()=>{const v=await assets.storage();info.textContent=v.quota===null?'浏览器未提供容量信息。':'此隔离扩展已用 '+Math.round(v.usage/1024)+' KiB，可用配额 '+Math.round(v.quota/1024/1024)+' MiB；本地保护 '+(v.persisted?'已启用':'未保证，仍需文件备份')+'。';},'容量检查完成。');
  }
  section=node('div');section.className='edit-footer';dialog.append(section);action('撤销上次修改',()=>undo());const close=action('关闭管理',async()=>dispose());
  function options(select,rows,key,label){const chosen=select.value;select.replaceChildren();for(const row of rows){const o=node('option',label(row));o.value=key(row);select.append(o);}if([...select.options].some(o=>o.value===chosen))select.value=chosen;}
  function refOptions(){const chosen=ref.value||context.refId,all=referenceFilter?snapshot.refs.filter(r=>(r.id+' '+r.displayTitle).includes(referenceQuery)):snapshot.refs;
    const rows=referenceFilter?all.slice(0,referenceLimit):all;
    if(chosen&&!rows.some(r=>r.id===chosen)){const selected=snapshot.refs.find(r=>r.id===chosen);if(selected)rows.unshift(selected);}
    options(ref,rows,r=>r.id,r=>r.displayTitle);if(chosen&&rows.some(r=>r.id===chosen))ref.value=chosen;
    if(referenceMore)referenceMore.hidden=all.length<=referenceLimit;
  }
  function populate(){const set=(f,v)=>{if(!dirty.has(f)){if(f.type==='checkbox')f.checked=v;else f.value=v;}};const w=snapshot.objects.workspaces[theme.value];set(name,w?.name??'');set(icon,w?.icon??'◇');set(order,w?.order??0);set(lock,w?.locked??true);const r=snapshot.refs.find(r=>r.id===ref.value);set(title,r?.displayTitle??'');set(windowOrder,Object.values(snapshot.objects.placements).find(p=>p.workspaceId===theme.value&&p.refId===ref.value)?.order??0);set(compact,snapshot.preferences?.compactRows?.value!==false);working.replaceChildren();const v=snapshot.preferences.workingSet?.value;for(const id of v?.refs??[])working.append(node('p',snapshot.refs.find(r=>r.id===id)?.displayTitle??'无法打开的引用 '+id));}
  function update(value){if(value.scope!==scope||value.revision<snapshot.revision)return;snapshot=value;warning.textContent=value.diagnostics?.view==='CORRUPT_VIEW'?'视图偏好记录损坏：已忽略损坏的视图，主题与窗口仍保留；损坏记录未被覆盖。':'';options(theme,Object.values(value.objects.workspaces),w=>w.id,w=>w.name);options(target,Object.values(value.objects.workspaces),w=>w.id,w=>w.name);refOptions();options(sources,Object.values(value.objects.sources),s=>s.id,s=>s.channel+(s.revoked?'（已撤销）':''));populate();}
  theme.onchange=()=>{for(const f of [name,icon,order,lock,windowOrder])dirty.delete(f);populate();};ref.onchange=()=>{for(const f of [title,windowOrder])dirty.delete(f);populate();};
  function dispose(){if(disposed)return;disposed=true;if(dialog.open)dialog.close();dialog.remove();dirty.clear();onClose();}
  function suspend(){if(disposed||suspended)return;suspended=true;priorFocus=dialog.contains(document.activeElement)?document.activeElement:null;if(dialog.open){ignoredCloses++;dialog.close();}dialog.remove();}
  function resume(value){if(disposed)return false;if(value.scope!==scope){dispose();return false;}update(value);if(suspended){suspended=false;document.body.append(dialog);dialog.showModal();if(priorFocus?.isConnected)priorFocus.focus();}return true;}
  dialog.addEventListener('close',()=>{if(ignoredCloses){ignoredCloses--;return;}if(!disposed)dispose();});
  document.body.append(dialog);update(snapshot);if(context.refId&&snapshot.refs.some(r=>r.id===context.refId)){ref.value=context.refId;populate();}if(context.workspaceId&&snapshot.objects.workspaces[context.workspaceId]){theme.value=context.workspaceId;populate();}dialog.showModal();(context.workspaceId?name:close).focus();return {update,suspend,resume,close:dispose};
}
