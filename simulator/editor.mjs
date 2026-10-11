const randomId=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
/** Small test integration UI for B3 commands. Own dialog, never a native title editor. */
export function openWorkspaceEditor({snapshot,command,undo,onClose=()=>{}}){
  let suspended=false,disposed=false,ignoredCloses=0,priorFocus=null;const scope=snapshot.scope,dirty=new Map();
  const read=input=>input.type==='checkbox'?input.checked:input.value;
  const dialog=document.createElement('dialog');dialog.dataset.vaiwlOwned='workspace-editor';dialog.setAttribute('aria-label','工作空间管理');
  dialog.style.cssText='width:min(580px,92vw);max-height:85vh;overflow:auto;border:1px solid #aaa;border-radius:16px;padding:24px;font:14px/1.6 system-ui;color:var(--ink,#222);background:var(--surface,#fff)';
  const node=(tag,label)=>{const n=document.createElement(tag);if(label)n.textContent=label;return n;};
  const heading=node('h2','工作空间管理');dialog.append(heading,node('p','只修改 VAIWL 派生数据。原生聊天、Project 和权限不变。'));
  const warning=node('p');warning.dataset.vaiwlDiagnostic='view';dialog.append(warning);
  const status=node('p');status.setAttribute('role','status');dialog.append(status);
  const field=(label,tag='input')=>{const wrap=node('label',label+' '),input=node(tag);input.setAttribute('aria-label',label);input.style.cssText='font:inherit;margin:6px 0;padding:7px;max-width:100%';if(tag!=='select'){const edited=()=>dirty.set(input,{revision:dirty.get(input)?.revision??snapshot.revision,value:read(input)});input.addEventListener('input',edited);input.addEventListener('change',edited);}wrap.append(input);dialog.append(wrap,node('br'));return input;};
  const action=(label,run)=>{const b=node('button',label);b.type='button';b.style.cssText='font:inherit;padding:7px 11px;margin:4px;border:1px solid #aaa;border-radius:8px';b.onclick=async()=>{b.disabled=true;try{await run();populate();status.textContent='已保存到派生工作空间。';}catch(e){status.textContent=e.message==='revision-conflict'?('另一标签页已修改；草稿已保留。最新保存标题：'+(snapshot.refs.find(r=>r.id===ref.value)?.displayTitle??'')+'；最新主题名称：'+(snapshot.objects.workspaces[theme.value]?.name??'')+'。核对后再次点击保存。'):e.message==='write-result-unknown'?'保存结果未确认；草稿已保留，重新连接后请核对最新数据。':('未完成：'+e.message);}finally{b.disabled=false;}};dialog.append(b);return b;};
  async function editCommand(value,fields){
    const chosen=fields.filter(f=>dirty.has(f)),expectedRevision=chosen.length?Math.min(...chosen.map(f=>dirty.get(f).revision)):snapshot.revision;const captured=new Map(fields.map(f=>[f,read(f)]));
    try{const result=await command(value,expectedRevision);for(const f of fields)if(read(f)===captured.get(f))dirty.delete(f);return result;}
    catch(e){if(e.message==='revision-conflict')for(const f of chosen)dirty.get(f).revision=snapshot.revision;throw e;}
  }
  const theme=field('主题选择','select'),newName=field('新主题名称');
  action('创建主题',async()=>{const id='W_'+randomId().replaceAll('-','');await editCommand({type:'CREATE_WORKSPACE',id,name:newName.value},[newName]);theme.value=id;populate();});
  dialog.append(node('hr'));
  const name=field('主题名称'),icon=field('主题图标'),order=field('主题顺序'),lock=field('锁定主题');order.type='number';lock.type='checkbox';
  action('保存主题',()=>editCommand({type:'UPDATE_WORKSPACE',id:theme.value,name:name.value,icon:icon.value,order:Number(order.value),locked:lock.checked},[name,icon,order,lock]));
  dialog.append(node('hr'));
  const ref=field('窗口选择','select'),title=field('派生标题');
  action('保存派生标题',()=>editCommand({type:'SET_TITLE',refId:ref.value,title:title.value,locked:true},[title]));
  const windowOrder=field('窗口顺序');windowOrder.type='number';
  action('保存窗口顺序',()=>editCommand({type:'PLACE',workspaceId:theme.value,refId:ref.value,order:Number(windowOrder.value)},[windowOrder]));
  const compact=field('紧凑窗口');compact.type='checkbox';action('保存显示偏好',()=>editCommand({type:'SET_PREFERENCE',id:'compactRows',value:compact.checked},[compact]));
  const target=field('目标主题','select');
  action('加入窗口',()=>command({type:'PLACE',workspaceId:theme.value,refId:ref.value}));
  action('移动窗口',()=>command({type:'MOVE',refId:ref.value,from:theme.value,to:target.value}));
  action('排除窗口',()=>command({type:'PLACE',workspaceId:theme.value,refId:ref.value,excluded:true}));
  dialog.append(node('hr'));action('撤销上次修改',()=>undo());
  const sources=field('证据来源','select');action('撤销证据来源',()=>command({type:'REVOKE_SOURCE',sourceId:sources.value}));
  const close=action('关闭管理',async()=>dispose());
  function options(select,rows,key,label){const chosen=select.value;select.replaceChildren();for(const row of rows){const o=node('option',label(row));o.value=key(row);select.append(o);}if([...select.options].some(o=>o.value===chosen))select.value=chosen;}
  function populate(){const set=(f,v)=>{if(!dirty.has(f)){if(f.type==='checkbox')f.checked=v;else f.value=v;}};const w=snapshot.objects.workspaces[theme.value];set(name,w?.name??'');set(icon,w?.icon??'◇');set(order,w?.order??0);set(lock,w?.locked??true);const r=snapshot.refs.find(r=>r.id===ref.value);set(title,r?.displayTitle??'');set(windowOrder,Object.values(snapshot.objects.placements).find(p=>p.workspaceId===theme.value&&p.refId===ref.value)?.order??0);set(compact,snapshot.preferences?.compactRows?.value!==false);}
  function update(value){if(value.scope!==scope||value.revision<snapshot.revision)return;snapshot=value;warning.textContent=value.diagnostics?.view==='CORRUPT_VIEW'?'视图偏好记录损坏：已忽略损坏的视图，主题与窗口仍保留；损坏记录未被覆盖。':'';options(theme,Object.values(value.objects.workspaces),w=>w.id,w=>w.name);options(target,Object.values(value.objects.workspaces),w=>w.id,w=>w.name);options(ref,value.refs,r=>r.id,r=>r.displayTitle+' · '+r.id);options(sources,Object.values(value.objects.sources),s=>s.id,s=>s.channel+(s.revoked?'（已撤销）':''));populate();}
  theme.onchange=()=>{for(const f of [name,icon,order,lock,windowOrder])dirty.delete(f);populate();};ref.onchange=()=>{for(const f of [title,windowOrder])dirty.delete(f);populate();};
  function dispose(){if(disposed)return;disposed=true;if(dialog.open)dialog.close();dialog.remove();dirty.clear();onClose();}
  function suspend(){if(disposed||suspended)return;suspended=true;priorFocus=dialog.contains(document.activeElement)?document.activeElement:null;if(dialog.open){ignoredCloses++;dialog.close();}dialog.remove();}
  function resume(value){if(disposed)return false;if(value.scope!==scope){dispose();return false;}update(value);if(suspended){suspended=false;document.body.append(dialog);dialog.showModal();if(priorFocus?.isConnected)priorFocus.focus();}return true;}
  dialog.addEventListener('close',()=>{if(ignoredCloses){ignoredCloses--;return;}if(!disposed)dispose();});
  document.body.append(dialog);update(snapshot);dialog.showModal();close.focus();return {update,suspend,resume,close:dispose};
}
