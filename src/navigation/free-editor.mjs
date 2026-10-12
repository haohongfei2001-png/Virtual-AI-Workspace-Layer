import {initialFreeTimePolicy,setFreeHorizon,FREE_HORIZONS} from '../data/free-time-policy.mjs';
/** Shared human preferences only; Free never edits virtual memberships or native facts. */
export function openFreeEditor({snapshot,command,assets,context={},onClose=()=>{}}){
 const scope=snapshot.scope,doc=document,dialog=doc.createElement('dialog');dialog.dataset.vaiwlOwned='free-settings';dialog.setAttribute('aria-label','工作空间设置');let disposed=false,suspended=false,ignore=0;
 const node=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text??'';return n;},status=node('p');status.setAttribute('role','status');
 dialog.append(node('h2','工作空间设置'),node('p','项目和聊天沿用原生名称。工作集、片段和显示设置只保存在本地。'),status);
 const action=(label,run)=>{const b=node('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await run();status.textContent='已完成。';}catch(e){status.textContent='未完成：'+e.message;}finally{b.disabled=false;}};dialog.append(b);return b;};
 const horizon=node('select');horizon.setAttribute('aria-label','工作空间时间范围');for(const H of FREE_HORIZONS){const o=node('option',H+'天');o.value=String(H);horizon.append(o);}const auto=node('option','自动');auto.value='auto';horizon.append(auto);dialog.append(horizon);
 action('保存时间范围',()=>{const day=snapshot.viewSession?.T??0,policy=snapshot.preferences?.freeTimePolicy?.value??initialFreeTimePolicy({day});return preference('freeTimePolicy',horizon.value==='auto'?{...policy,mode:'auto',revision:policy.revision+1,recommendation:null,confirmations:0}:setFreeHorizon(policy,Number(horizon.value),day));});
 const select=node('select');select.setAttribute('aria-label','窗口选择');dialog.append(select);
 const preference=(id,value)=>command({type:'SET_PREFERENCE',id,value});
 action('加入当前工作集',()=>{const prior=snapshot.preferences?.workingSet?.value??{refs:[],current:null};return preference('workingSet',{refs:[...new Set([...prior.refs,select.value])],current:select.value});});
 action('从工作集移除所选窗口',()=>{const prior=snapshot.preferences?.workingSet?.value??{refs:[],current:null},refs=prior.refs.filter(id=>id!==select.value);return preference('workingSet',{refs,current:refs.includes(prior.current)?prior.current:refs[0]??null});});
 action('将所选窗口前移',()=>{const prior=snapshot.preferences?.workingSet?.value??{refs:[],current:null},refs=[...prior.refs],i=refs.indexOf(select.value);if(i<1)throw Error('所选窗口无法前移');[refs[i-1],refs[i]]=[refs[i],refs[i-1]];return preference('workingSet',{...prior,refs});});
 action('保存所选片段',async()=>{if(!context.snippet)throw Error('请先在原生消息中选择可唯一定位的片段');await preference('savedSnippets',[...(snapshot.preferences?.savedSnippets?.value??[]),{...context.snippet,id:'s_'+crypto.randomUUID().replaceAll('-','')}]);context.snippet=null;});
 action('移除所选窗口片段',()=>preference('savedSnippets',(snapshot.preferences?.savedSnippets?.value??[]).filter(s=>s.refId!==select.value)));
 action('切换紧凑窗口',()=>preference('compactRows',snapshot.preferences?.compactRows?.value===false));
 if(assets){action('导出工作空间备份',async()=>{const bundle=await assets.export(),url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'})),a=node('a');a.href=url;a.download='vaiwl-workspace-backup.json';dialog.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 const file=node('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','选择工作空间备份');dialog.append(file);const previewInfo=node('p');previewInfo.setAttribute('role','status');dialog.append(previewInfo);let bundle=null,preview=null;file.onchange=()=>{bundle=null;preview=null;previewInfo.textContent='';};
 action('预览备份恢复',async()=>{const f=file.files?.[0];if(!f||f.size>17*1024*1024)throw Error('请选择有效备份文件');bundle=JSON.parse(await f.text());preview=await assets.preview(bundle);previewInfo.textContent='新增 '+preview.summary.added+' 项；更新 '+preview.summary.updated+' 项；保留当前人工修改 '+preview.summary.keptHuman+' 项。不会导入发送证据或执行授权。';});
 action('应用预览恢复',async()=>{if(!bundle||!preview)throw Error('请先预览备份');await assets.restore(bundle,preview);preview=null;previewInfo.textContent='已完成恢复。';});}
 function close(){if(disposed)return;disposed=true;dialog.remove();onClose();}
 action('关闭设置',close);
 function update(value){if(value.scope!==scope)return close();snapshot=value;const policy=value.preferences?.freeTimePolicy?.value;horizon.value=policy?.mode==='fixed'?String(policy.H):'auto';const chosen=select.value||context.refId;select.replaceChildren();for(const r of value.refs){const option=node('option',r.nativeTitle??'名称暂不可用');option.value=r.id;select.append(option);}if(value.refs.some(r=>r.id===chosen))select.value=chosen;}
 function suspend(){if(disposed||suspended)return;suspended=true;if(dialog.open){ignore++;dialog.close();}dialog.remove();}
 function resume(value){if(disposed)return false;if(value.scope!==scope){close();return false;}update(value);if(suspended){suspended=false;doc.body.append(dialog);dialog.showModal();}return true;}
 dialog.addEventListener('close',()=>{if(ignore)ignore--;else close();});update(snapshot);doc.body.append(dialog);dialog.showModal();return {close,update,suspend,resume};
}
