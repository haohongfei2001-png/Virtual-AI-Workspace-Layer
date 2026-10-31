import { proCSS } from './styles.mjs';
import { svgIcon, iconPaths, defaultIcon, workspaceReturnIcon } from '../../navigation/icons.mjs';
import { projectTopicGroups, searchProReferences } from '../projection/project.mjs';
import { nextSeriesEntry } from '../navigation/launch-context.mjs';

const icons={more:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>',plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></svg>'};
const entries=table=>Object.values(table??{});
const sameReview=(a,b)=>!!a&&!!b&&['scopeKey','authorizationEpoch','overlayRevision','reviewId'].every(key=>a[key]===b[key]);
const titleOf=(snapshot,id)=>snapshot.references.find(r=>r.id===id)?.nativeTitle??'暂时无法打开的聊天';
const unwrap=value=>{if(value?.ok===false)throw Error(value.reason??'operation-failed');return value?.ok===true?value.value:value;};
const reasonMessage=reason=>/invalid-budget-amount/.test(reason)?'请输入不小于 0 的金额，最多保留六位小数；不要使用指数、货币符号或分隔符。':/budget-task-limit/.test(reason)?'每项任务额度超过当前模型许可的上限。请降低金额，或先由可信模型设置更新许可。':/missing-name|invalid-name|empty-name|topic-name|title-empty|invalid-title/.test(reason)?'请填写名称后再继续。名称只保存在整理资料中。':/missing-topic|missing-source-topics|empty-project-scope/.test(reason)?'请先选择至少一个主题或项目，再预览这次更改。':/missing-split-members/.test(reason)?'请至少选择一条聊天，并指定要拆分到的新主题。':/empty-proposal-batch|empty-compensation/.test(reason)?'请先勾选要应用的内容。':/invalid-sequence/.test(reason)?'序号请使用数字，例如 1 或 1.2；留空可以保留分支或断点。':/missing-backup/.test(reason)?'请先选择整理备份文件。':/pro-batch-capacity/.test(reason)?'所选内容超过一次处理上限。请分批选择，或先处理、拒绝部分已保存建议，再重新评估。已有资料保留。':/proposal-review-capacity/.test(reason)?'待审建议已达到容量上限。请先处理或拒绝一部分建议，再继续整理。':/alias-capacity/.test(reason)?'历史名称已达到保留上限。请在历史名称中明确移除不再需要的旧名称，再保存这次改名。':/backup-too-large|capacity|quota|storage-limit/.test(reason)?'资料已达到当前容量上限。此次更改尚未保存，请先通过备份与恢复导出资料，再处理容量。':/request-too-large/.test(reason)?'所选成员较多，单次请求超过上限。尚未保存更改，请减少本次选择后重新预览。':/stale|revision|conflict|hash|expected/.test(reason)?'之后有修改，请先查看差异，再重新确认。':/exclusion|exclude|human|lock|protected/.test(reason)?'这项更改受到人工设置保护。请先检查锁定或排除，再明确调整。':/scope|grant|authorization|revoked|capability|unavailable/.test(reason)?'当前无法确认可整理范围。原生项目和聊天仍可继续使用。':/cycle|series/.test(reason)?'工作线的顺序存在冲突，请检查接续关系。':'暂时无法确认操作结果。可以保留当前确认并重试核对，或重新打开工作区查看已保存资料。';

/** Owns only the supplied extension surface. No host DOM, native draft or network access. */
export function createProWorkspace(root,controller) {
  const doc=root.ownerDocument??root.host?.ownerDocument;
  if(!doc||!controller)throw Error('invalid-pro-workspace');
  const shadow=root.host?root:root.shadowRoot??root.attachShadow({mode:'open'});
  const el=(tag,attrs={},text='')=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!==null&&v!==undefined)n.setAttribute(k,String(v));n.textContent=text;return n;};
  const style=el('style');style.textContent=proCSS;
  const shell=el('section',{class:'pro-shell','aria-label':'VAIWL 工作区'}),toolbar=el('header',{class:'pro-toolbar'}),scopeNotice=el('div',{class:'pro-scope'}),main=el('main',{class:'pro-body',tabindex:'-1'}),notice=el('div',{class:'pro-notice',role:'status','aria-live':'polite'});
  shadow.replaceChildren(style,shell);shell.append(toolbar,scopeNotice,main,notice);
  let destroyed=false,renderGeneration=0,panelIntent=0,dialog=null,nativeRenderer=null,nativeKind=null,nativeContainer=null,composing=false,pendingPaint=false,segment=0,lastScope=null,lastAuthorizationEpoch=null,lastNative=null,returning=null,lastProMode='pro-default-none',lastProProjects=[];
  const activePointers=new Set(),activeKeys=new Set();let paintTimer=null;
  const flushPaint=()=>{if(paintTimer!==null)return;paintTimer=setTimeout(()=>{paintTimer=null;if(!destroyed&&!composing&&!activePointers.size&&!activeKeys.size&&pendingPaint){pendingPaint=false;render();}},0);};
  const rowLimits=new Map(),rowOffsets=new Map(),oldLimits=new Map(),oldOffsets=new Map(),inventoryLimits=new Map(),inventoryOffsets=new Map(),olderOpen=new Set(),anchors=new Map();
  const state=()=>controller.getState(),snapshot=()=>controller.getSnapshot(),status=()=>controller.getStatus?.()??{};
  const canSave=()=>status().authorized!==false&&(status().persistence===undefined||status().persistence==='same-idb');
  const canEdit=()=>canSave()&&['pro','active'].includes(status().entitlement);
  const canPreview=()=>status().authorized!==false&&['pro','active'].includes(status().entitlement);
  const readOnlyMessage=()=>canSave()?'已保存整理仍可查看、导出、删除和撤销。新的整理目前暂停。':'当前为临时预览。请从扩展状态页确认并解锁浏览器本地个人空间后，再保存整理。原生项目与聊天仍可使用。';
  const notify=text=>{notice.textContent=text;};
  const error=err=>{const message=reasonMessage(String(err?.message??err));if(dialog){dialog.error.textContent=message;dialog.error.hidden=false;}else notify(message);};
  const run=async action=>{try{return unwrap(await action());}catch(e){error(e);return null;}};
  const button=(label,action,{icon=null,primary=false,danger=false,key=null}={})=>{const b=el('button',{type:'button',class:icon?'pro-icon':'pro-text-button'+(primary?' primary':'')+(danger?' danger':''),'aria-label':label,title:icon?label:null,'data-focus-key':key??label},icon?'':label);if(icon)b.innerHTML=icons[icon]??icon;let pending=false;b.addEventListener('click',()=>{if(pending)return;pending=true;const disabled=b.disabled;b.disabled=true;b.setAttribute('aria-busy','true');void run(()=>action(b)).finally(()=>{pending=false;b.removeAttribute('aria-busy');if(b.isConnected)b.disabled=disabled;});});return b;};
  function field(parent,label,value,{type='text',options=null}={}) {const box=el('label',{class:'pro-field'}),caption=el('span',{},label),input=options?el('select',{'aria-label':label}):el('input',{type,'aria-label':label});if(options)for(const item of options)input.append(el('option',{value:item.value},item.label));input.value=value??'';box.append(caption,input);parent.append(box);return input;}
  function check(parent,label,checked=false) {const row=el('label',{class:'pro-checkbox'}),input=el('input',{type:'checkbox'});input.checked=checked;row.append(input,el('span',{},label));parent.append(row);return input;}
  function paragraph(parent,text,className='pro-note'){const n=el('p',{class:className},text);parent.append(n);return n;}
  function actions(parent,...buttons){const bar=el('div',{class:'pro-actions'});bar.append(...buttons);parent.append(bar);return bar;}
  function advanced(parent,label){const details=el('details',{class:'pro-advanced'});details.append(el('summary',{},label));parent.append(details);return details;}
  function closeDialog({restoreFocus=true}={}) {
    panelIntent++;if(!dialog)return;const old=dialog;dialog=null;old.layer.remove();main.inert=false;toolbar.inert=false;
    if(restoreFocus){const match=[...shadow.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===old.focusKey);(old.trigger?.isConnected?old.trigger:match??main)?.focus({preventScroll:true});}
  }
  function openDialog(title,{wide=false,trigger=null}={}) {
    closeDialog({restoreFocus:false});
    const layer=el('div',{class:'pro-layer'+(wide?' wide':'')}),panel=el('section',{class:'pro-sheet',role:'dialog','aria-modal':'true','aria-label':title,tabindex:'-1'}),head=el('div',{class:'pro-sheet-head'}),body=el('div',{class:'pro-sheet-body'}),footer=el('div',{class:'pro-sheet-footer'}),errorNode=el('p',{class:'pro-warning',role:'alert'});errorNode.hidden=true;
    const close=button('关闭',()=>closeDialog(),{icon:'close'});head.append(el('h2',{},title),close);panel.append(head,errorNode,body,footer);layer.append(panel);shell.append(layer);main.inert=true;toolbar.inert=true;
    dialog={layer,panel,body,footer,error:errorNode,trigger:trigger??shadow.activeElement,focusKey:(trigger??shadow.activeElement)?.dataset.focusKey,expected:structuredClone(snapshot().versions)};
    layer.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDialog();}if(e.key==='Tab'){const items=[...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);const first=items[0],last=items.at(-1);if(!first){e.preventDefault();panel.focus();}else if(e.shiftKey&&(shadow.activeElement===first||shadow.activeElement===panel)){e.preventDefault();last.focus();}else if(!e.shiftKey&&shadow.activeElement===last){e.preventDefault();first.focus();}}});
    queueMicrotask(()=>{if(dialog?.panel===panel)(body.querySelector('input,select')??close).focus();});return dialog;
  }
  async function preparePanel(kind,id=null,options={}) {
    if(!controller.loadPanel)return true;const token=++panelIntent;
    if(options.expected&&!sameReview(options.expected,snapshot().versions))throw Error('stale-pro-panel-review');
    const value=await controller.loadPanel(kind,id,options);
    if(value&&options.expected&&!sameReview(options.expected,value.versions))throw Error('stale-pro-panel-review');
    return !destroyed&&token===panelIntent&&value!==null&&status().authorized!==false?value:false;
  }
  async function dispatch(command,expected=dialog?.expected) {const source=dialog,result=unwrap(await controller.dispatch(command,expected?{expected}:undefined));if(dialog===source)closeDialog();if(!destroyed&&status().authorized!==false)notify('已保存。可以在整理记录中撤销。');await render();return result;}
  function createTopic(trigger) {const d=openDialog('新建主题',{trigger}),input=field(d.body,'主题名称',''),create=button('创建主题',()=>{if(!input.value.trim())throw Error('missing-name');return dispatch({type:'CREATE_TOPIC',name:input.value.trim()},d.expected);},{primary:true});paragraph(d.body,'空主题也会保留。聊天仍使用原来的身份与原生入口。');d.footer.append(button('取消',()=>closeDialog()),create);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();create.click();}});}
  function activeTopicOptions({blank=false}={}){return [...(blank?[{value:'',label:'选择主题'}]:[]),...entries(state().topics).filter(t=>t.lifecycle==='active').map(t=>({value:t.id,label:t.name}))];}
  function paintReferenceRelations(parent,refId,display,d,trigger,editable=true) {
    parent.replaceChildren();const relations=entries(display.placements).filter(p=>p.conversationId===refId&&p.state==='included');
    for(const p of relations){const row=el('div',{class:'pro-list-item'});row.append(el('h3',{},display.topics[p.topicId]?.name??'已保存主题'));paragraph(row,p.role==='primary'?'主收录':'关联');
      actions(row,button('从此主题打开',()=>openReference(refId,{origin:'topic',topicId:p.topicId})));
      if(editable)actions(row,button(p.role==='related'?'移除关联':'不归入此主题',()=>dispatch({type:p.role==='related'?'REMOVE_RELATED':'EXCLUDE_TOPIC',refId,topicId:p.topicId},d.expected)),button(p.control.locked?'解除关系锁':'锁定关系',()=>dispatch({type:'SET_LOCK',target:{kind:'placement',refId,topicId:p.topicId},locked:!p.control.locked},d.expected)),button('恢复关系自动整理',()=>confirmCommand('恢复关系自动整理','只移交这条关系。已明确排除的其他主题不会解除。',{type:'RELEASE_TO_AUTO',target:{kind:'placement',refId,topicId:p.topicId}},trigger)));parent.append(row);
    }
    const excluded=entries(display.constraints).filter(c=>c.kind==='exclude-topic'&&c.refId===refId);
    if(excluded.length){parent.append(el('h3',{class:'pro-subhead'},'已排除'));for(const c of excluded){const name=display.topics[c.topicId]?.name??'已保存主题';if(editable)actions(parent,button('解除排除：'+name,()=>confirmCommand('解除这条排除','解除后，这条聊天才可以重新收录到该主题。不会立即运行模型。',{type:'REMOVE_TOPIC_EXCLUSION',refId,topicId:c.topicId},trigger)));else paragraph(parent,name);}}
    if(!relations.length&&!excluded.length)paragraph(parent,'当前候选页没有已保存的收录或排除。');
  }
  function referencePages(d,refId,referencePanel,paint) {
    if(!controller.loadPanel){paint({display:state()});return;}
    const position=paragraph(d.body,''),pager=el('div',{class:'pro-actions'});d.body.append(pager);
    const show=panel=>{paint(panel);position.textContent='候选主题 '+(panel.page.count?panel.page.offset+1:0)+'–'+(panel.page.offset+panel.page.count)+' / '+panel.page.total;pager.replaceChildren();
      if(panel.page.offset>0)pager.append(button('上一页关联主题',()=>load(Math.max(0,panel.page.offset-panel.page.limit))));if(panel.page.hasMore)pager.append(button('下一页关联主题',()=>load(panel.page.offset+panel.page.count)));
    };
    const load=async offset=>{try{const panel=await preparePanel('reference',refId,{offset,limit:24,expected:d.expected});if(panel&&dialog===d)show(panel);}catch(e){if(dialog===d){for(const b of d.body.querySelectorAll('button'))b.disabled=true;error(e);}}};show(referencePanel);
  }
  async function editReference(refId,trigger,{draft=null,expected=null}={}) {
    if(expected&&!sameReview(expected,snapshot().versions))throw Error('stale-pro-reference-review');
    const referencePanel=await preparePanel('reference',refId,{limit:24,...(expected?{expected}:{})});if(!referencePanel)return;
    const ref=snapshot().references.find(r=>r.id===refId);if(!ref)return;
    if(!canEdit()){const d=openDialog('已保存的名称与主题',{trigger}),title=state().titles[refId],relations=el('div');paragraph(d.body,readOnlyMessage());paragraph(d.body,'原始名称：'+ref.nativeTitle);if(title?.title)paragraph(d.body,'已保存整理标题：'+title.title);if(controller.getAliases&&title)actions(d.body,button('管理历史名称',()=>openAliases('title',refId,trigger)));referencePages(d,refId,referencePanel,panel=>paintReferenceRelations(relations,refId,panel.display,d,trigger,false));d.body.append(relations);d.footer.append(button('完成',()=>closeDialog()));return;}
    const s=state(),title=s.titles[refId],relations=entries(s.placements).filter(p=>p.conversationId===refId&&p.state==='included'),primary=relations.find(p=>p.role==='primary'),d=openDialog('名称与主题',{trigger});
    paragraph(d.body,'原始名称：'+ref.nativeTitle,'pro-original');
    const titleInput=field(d.body,'整理标题',draft?.title??title?.title??ref.nativeTitle);
    actions(d.body,button('保存整理标题',()=>dispatch({type:'SET_DERIVED_TITLE',refId,title:titleInput.value.trim()},d.expected)),button('持续显示原名',()=>dispatch({type:'RESTORE_NATIVE_TITLE',refId},d.expected)));
    if(title?.title&&title.displayPreference==='native')actions(d.body,button('显示已保存的整理标题',()=>dispatch({type:'SET_TITLE_DISPLAY',refId,displayPreference:'derived'},d.expected)));
    if(title){paragraph(d.body,title.control.mode==='human'?'标题由你管理。解除锁定后，仍保留人工管理。':'标题已交还自动整理；当前修改仍需满足模型与范围条件。');actions(d.body,button(title.control.locked?'解除名称锁':'锁定名称',()=>dispatch({type:'SET_LOCK',target:{kind:'title',refId},locked:!title.control.locked},d.expected)),button('恢复标题自动整理',()=>confirmCommand('恢复标题自动整理','只交还这个标题的管理权，不会立即改名或运行模型。',{type:'RELEASE_TO_AUTO',target:{kind:'title',refId}},trigger)));if(controller.getAliases||title.aliases?.length){const more=advanced(d.body,'历史名称');paragraph(more,'曾使用的整理标题可以用于查找。移除旧名称不会改变当前标题。');actions(more,button('管理历史名称',()=>openAliases('title',refId,trigger)));}}
    d.body.append(el('hr',{class:'pro-divider'}));
    if(ref.membership.state==='UNKNOWN'){paragraph(d.body,'原生归属还在核对。你仍可以打开和查找这条聊天；确认归属前不能将它收录进主题。');d.footer.append(button('完成',()=>closeDialog()));return;}
    const pick=field(d.body,'主主题',primary?.topicId??'',{options:activeTopicOptions({blank:true})});
    actions(d.body,button('设为主主题',()=>{if(!pick.value)throw Error('missing-topic');return dispatch(primary&&primary.topicId!==pick.value?{type:'MOVE_PRIMARY',refId,from:primary.topicId,to:pick.value}:{type:'SET_PLACEMENT',refId,topicId:pick.value,role:'primary'},d.expected);}));
    paragraph(d.body,'主主题参与活跃排序。人工移动会阻止下一轮自动整理移回原主题。');
    const related=field(d.body,'也关联到','',{options:activeTopicOptions({blank:true})});actions(d.body,button('添加关联',()=>{if(!related.value)throw Error('missing-topic');return dispatch({type:'SET_PLACEMENT',refId,topicId:related.value,role:'related'},d.expected);}));
    for(const [select,saved]of [[pick,draft?.primary],[related,draft?.related]])if(saved){if(saved.value&&![...select.options].some(option=>option.value===saved.value))select.append(el('option',{value:saved.value},saved.label));select.value=saved.value;}
    paragraph(d.body,'关联不推进主题活跃；没有主主题的聊天仍在未收录入口。');
    const relationRows=el('div');
    referencePages(d,refId,referencePanel,panel=>{
      if(controller.loadPanel){
        const retained=[pick,related].map(select=>({value:select.value,label:select.selectedOptions[0]?.textContent??'已选择主题'})),options=new Map(entries(panel.display.topics).filter(t=>t.lifecycle==='active').map(t=>[t.id,t.name]));
        for(const value of retained)if(value.value&&!options.has(value.value))options.set(value.value,value.label);
        for(const [n,select]of [pick,related].entries()){select.replaceChildren(el('option',{value:''},'选择主题'));for(const [id,name]of options)select.append(el('option',{value:id},name));select.value=retained[n].value;}
      }
      paintReferenceRelations(relationRows,refId,panel.display,d,trigger);
    });d.body.append(relationRows);
    const noAI=entries(s.constraints).some(c=>c.kind==='exclude-ai-processing'&&c.refId===refId);
    d.body.append(el('hr',{class:'pro-divider'}));actions(d.body,button(noAI?'允许参与 AI 整理':'不参与 AI 整理',()=>confirmCommand(noAI?'允许参与 AI 整理':'不参与 AI 整理',noAI?'恢复可处理状态，仍需当前有效用途许可；不会立即花费或重跑。':'取消尚未发出的整理工作，并阻止迟到结果应用。已经保存的主题与标题继续保留。',{type:'SET_AI_PROCESSING',refId,policy:noAI?'allowed':'excluded'},trigger)));
    if(controller.previewRemoveAI)actions(d.body,button('移除 AI 生成的整理',async()=>{const plan=unwrap(await controller.previewRemoveAI([refId],{expected:d.expected}));confirmCommand('移除 AI 生成的整理','只移除此聊天仍由自动整理管理的派生资产；保留人工成果和原生聊天。',{type:'REMOVE_AI_ARTIFACTS',refIds:[refId],reviewedPlanHash:plan.planHash},trigger);}));
    d.footer.append(button('完成',()=>closeDialog()));
    if(controller.getModelStatus&&controller.previewModel&&controller.startModelReview&&!noAI&&ref.available&&
      (ref.membership.state==='NONE'||status().mode==='pro-cross-project'&&status().selectedProjectIds?.includes(ref.membership.projectId))){
      try{const model=unwrap(await controller.getModelStatus()).model;if(dialog!==d||!canEdit()||!model.enabled)return;
        const more=advanced(d.body,'模型精细复核');paragraph(more,'仅复核这条聊天，使用当前已配置的同一模型与已获准数据。先确认示例和费用，结果仍需逐项审阅。');
        actions(more,button('精细复核这条聊天',()=>{
          if(!canEdit()||!sameReview(d.expected,snapshot().versions))throw Error('stale-pro-reference-review');
          const saved={title:titleInput.value,primary:{value:pick.value,label:pick.selectedOptions[0]?.textContent??'已选择主题'},related:{value:related.value,label:related.selectedOptions[0]?.textContent??'已选择主题'}};
          return confirmModelProcessing(trigger,{refIds:[refId],reviewOnly:true,onCancel:()=>editReference(refId,trigger,{draft:saved,expected:d.expected})});
        }));
      }catch{/* Optional model status cannot block manual title/relationship work. */}
    }
  }
  function confirmCommand(title,description,command,trigger) {const d=openDialog(title,{trigger});paragraph(d.body,description);d.footer.append(button('取消',()=>closeDialog()),button('确认',()=>dispatch(command,d.expected),{primary:true}));}
  async function topicSettings(topicId,trigger) {
    if(!await preparePanel('topic',topicId))return;
    const topic=state().topics[topicId];if(!topic)return;const d=openDialog('主题设置',{trigger});if(!canEdit()){paragraph(d.body,'已保存主题：'+topic.name);paragraph(d.body,readOnlyMessage());actions(d.body,button('在主题内查找',()=>openSearch(topicId,trigger)),button('查看已保存工作线',()=>seriesList(topicId,trigger)));if(controller.getAliases)actions(d.body,button('管理历史名称',()=>openAliases('topic',topicId,trigger)));d.footer.append(button('完成',()=>closeDialog()));if(canSave())d.footer.append(button('删除主题',async()=>{const p=unwrap(await controller.previewDelete(topicId,{expected:d.expected}));confirmCommand('删除主题','只删除这个虚拟主题，保留原生聊天。',{type:'DELETE_TOPIC',topicId,reviewedPlanHash:p.planHash},trigger);}));return;}const name=field(d.body,'主题名称',topic.name);
    actions(d.body,button('保存名称',()=>{if(!name.value.trim())throw Error('missing-name');return dispatch({type:'SET_TOPIC_NAME',topicId,name:name.value.trim()},d.expected);}));
    if(controller.getAliases||topic.aliases?.length){const more=advanced(d.body,'历史名称');paragraph(more,'旧名称继续参与查找。可以逐项移除不再需要的名称，当前主题与整理记录保留。');actions(more,button('管理历史名称',()=>openAliases('topic',topicId,trigger)));}
    paragraph(d.body,'名称与成员分别管理。解除锁定不会把人工决定自动交给模型。');
    for(const[kind,label,control]of [['topic-name','主题名称',topic.nameControl],['topic-membership','主题成员',topic.membershipControl]])actions(d.body,button((control.locked?'解除':'锁定')+label,()=>dispatch({type:'SET_LOCK',target:{kind,topicId},locked:!control.locked},d.expected)),button('恢复'+label+'自动整理',()=>confirmCommand('恢复'+label+'自动整理','只移交所选范围，保留其他人工保护与明确排除。',{type:'RELEASE_TO_AUTO',target:{kind,topicId}},trigger)));
    d.body.append(el('hr',{class:'pro-divider'}));
    actions(d.body,button('收录聊天',()=>collectIntoTopic(topicId,trigger)),button('在主题内查找',()=>openSearch(topicId,trigger)),button('查看与编辑工作线',()=>seriesList(topicId,trigger)),button('拆分主题',()=>splitTopic(topicId,trigger)),button('合并主题',()=>mergeTopics(topicId,trigger)));
    actions(d.body,button('删除主题',async()=>{const plan=unwrap(await controller.previewDelete(topicId,{expected:d.expected})),c=openDialog('删除主题',{trigger});paragraph(c.body,'主题容器将移除，原生聊天继续保留。成员回到原名入口；相同依据不会立刻自动重建此主题。');paragraph(c.body,'删除可以通过整理记录按当前修改情况撤销。');c.footer.append(button('取消',()=>closeDialog()),button('确认删除',()=>dispatch({type:'DELETE_TOPIC',topicId,reviewedPlanHash:plan.planHash},c.expected),{danger:true}));},{danger:true}));
    d.footer.append(button('完成',()=>closeDialog()));
  }
  async function collectIntoTopic(topicId,trigger,offset=0) {const remotePanel=await preparePanel('collect',topicId,{offset,limit:24});if(!remotePanel)return;const d=openDialog('收录聊天',{trigger});paragraph(d.body,'选择已确认属于当前整理范围的聊天。收录只建立虚拟关系。');const options=(remotePanel?.items??snapshot().references).filter(r=>r.available&&(r.membership.state==='NONE'||status().mode==='pro-cross-project'&&status().selectedProjectIds?.includes(r.membership.projectId))).map(r=>({value:r.id,label:r.nativeTitle}));if(!options.length){paragraph(d.body,'当前没有可确认归属的聊天。原生入口仍可用。');d.footer.append(button('完成',()=>closeDialog()));return;}const select=field(d.body,'聊天',options[0].value,{options}),role=field(d.body,'关系','primary',{options:[{value:'primary',label:'主收录'},{value:'related',label:'也关联'}]});d.footer.append(button('取消',()=>closeDialog()),button('收录',()=>dispatch({type:'SET_PLACEMENT',refId:select.value,topicId,role:role.value},d.expected),{primary:true}));if(remotePanel?.page.offset>0)d.footer.prepend(button('上一页聊天',()=>collectIntoTopic(topicId,trigger,Math.max(0,offset-remotePanel.page.limit))));if(remotePanel?.page.hasMore)d.footer.prepend(button('下一页聊天',()=>collectIntoTopic(topicId,trigger,offset+remotePanel.page.count)));}
  function openSearch(topicId=null,trigger) {
    const d=openDialog(topicId?'在主题内查找':'查找已知聊天',{trigger}),input=field(d.body,'查找名称、别名或工作线',''),results=el('div'),pager=el('div',{class:'pro-actions'}),progress=paragraph(d.body,'');
    paragraph(d.body,'查找当前已知范围。每条聊天只显示一次，多个主题入口在结果内选择。');d.body.append(results);d.footer.append(pager,button('完成',()=>closeDialog()));let searchSerial=0,review=structuredClone(d.expected);
    const show=async(offset=0,fresh=false)=>{const ticket=++searchSerial,query=input.value;if(fresh)review=structuredClone(snapshot().versions);const expected=structuredClone(review);results.setAttribute('aria-busy','true');try{
      if(!sameReview(expected,snapshot().versions))throw Error('stale-pro-search-review');
      let result;if(controller.searchPage)result=await controller.searchPage(query,{topicId,offset,limit:24});else{const all=controller.search?await controller.search(query,{topicId}):searchProReferences(state(),snapshot(),query,{topicId,mode:status().mode,selectedProjectIds:status().selectedProjectIds??[]});result={items:all.slice(offset,offset+24),page:{offset,count:Math.min(24,Math.max(0,all.length-offset)),total:all.length,limit:24,hasMore:offset+24<all.length}};}
      if(dialog!==d||ticket!==searchSerial||input.value!==query)return;if(!sameReview(expected,snapshot().versions))throw Error('stale-pro-search-review');results.replaceChildren();pager.replaceChildren();d.error.hidden=true;
      for(const match of result.items){const row=el('div',{class:'pro-list-item'});row.append(button(match.displayTitle,()=>openReference(match.refId,{origin:'search',topicId:null})));if(match.nativeTitle!==match.displayTitle)paragraph(row,'原名：'+match.nativeTitle);for(const choice of match.contexts.slice(0,4))actions(row,button('从「'+(choice.name??state().topics[choice.topicId]?.name??'主题')+'」打开',()=>openReference(match.refId,{origin:'topic',topicId:choice.topicId})));actions(row,button('查看全部名称与关联',b=>editReference(match.refId,b)));results.append(row);}
      const page=result.page;progress.textContent=page.total?'结果 '+(page.offset+1)+'–'+(page.offset+page.count)+' / '+page.total:'';
      if(!results.childNodes.length)paragraph(results,'没有找到。可以继续使用原生搜索。');
      if(page.offset>0)pager.append(button('上一页查找结果',()=>show(Math.max(0,page.offset-page.limit))));if(page.hasMore)pager.append(button('下一页查找结果',()=>show(page.offset+page.count)));
    }catch(e){if(dialog===d&&ticket===searchSerial){results.replaceChildren();pager.replaceChildren(button('重新查找',()=>show(0,true)));progress.textContent='';error(e);}}finally{if(dialog===d&&ticket===searchSerial)results.removeAttribute('aria-busy');}};
    input.addEventListener('input',()=>{void show(0,true);});void show();
  }
  function previewColumns(parent,before,after) {const diff=el('div',{class:'pro-diff'});for(const[label,lines]of [['现在',before],['确认后',after]]){const section=el('section'),list=el('ul');section.append(el('h3',{},label));for(const line of lines)list.append(el('li',{},line));section.append(list);diff.append(section);}parent.append(diff);}
  function structureConflictDescription(conflict) {
    if(typeof conflict.description==='string'&&conflict.description)return conflict.description;
    const s=state(),ref=conflict.refId??conflict.conversationId,chat=ref?'「'+titleOf(snapshot(),ref)+'」':'这条聊天',topic=id=>'「'+(s.topics[id]?.name??'已保存主题')+'」';
    if(conflict.kind==='include-exclude'&&conflict.excludedTopicId&&conflict.targetTopicId)return chat+'已明确排除'+topic(conflict.excludedTopicId)+'。合并到'+topic(conflict.targetTopicId)+'会同时收录并排除它；请先明确解除原排除，再重新预览。';
    if(conflict.kind==='forbid-merge'&&Array.isArray(conflict.topicIds))return conflict.topicIds.map(topic).join('与')+'已有禁止合并的人工设置；当前不能合并。';
    if(conflict.kind==='locked-topic-membership'&&conflict.topicId)return topic(conflict.topicId)+'的成员已锁定。请先明确解除主题成员锁，再重新预览。';
    if(conflict.kind==='series-crosses-split'&&conflict.seriesId)return '工作线「'+(s.series[conflict.seriesId]?.title??'已保存工作线')+'会跨越拆分后的主题。请保留整条工作线，或先明确调整接续与分支。';
    return (ref?titleOf(snapshot(),ref)+'：':'')+(/exclu/.test(conflict.reason??conflict.kind??'')?'包含与排除不一致。请明确解除相应排除后重新预览。':/lock|protect/.test(conflict.reason??conflict.kind??'')?'成员已锁定。请明确解除该关系的锁定后重新预览。':/series/.test(conflict.reason??conflict.kind??'')?'这条工作线会跨越拆分后的主题。请保留整条工作线，或先明确调整工作线关系。':'已有设置与计划冲突，请核对后重新预览。');
  }
  function structurePreview(title,result,{before,after,trigger,onBack}) {const d=openDialog(title,{wide:true,trigger});previewColumns(d.body,before,after);paragraph(d.body,'只修改虚拟主题与关系。原生项目、聊天、标题和内容保持原样。');const conflicts=result.conflicts??[];if(result.summary)paragraph(d.body,result.summary);if(conflicts.length){paragraph(d.body,'需要先处理以下冲突；当前没有应用任何更改。','pro-warning');for(const conflict of conflicts){paragraph(d.body,structureConflictDescription(conflict));}}d.footer.append(button('返回调整',onBack),button('取消',()=>closeDialog()));if(!conflicts.length&&(result.proposal||result.kind==='manual-series-plan'||result.previewId))d.footer.append(button('确认应用',async()=>{unwrap(await controller.applyStructure(result));closeDialog();notify('结构已保存。原入口与撤销记录继续可用。');await render();},{primary:true}));}
  async function mergeTopics(keepId,trigger,seed=null) {
    if(seed&&!sameReview(seed.expected,snapshot().versions))throw Error('stale-pro-panel-review');
    let kept=seed?.kept??state().topics[keepId];if(!kept)throw Error('missing-topic');kept={id:kept.id,name:kept.name};
    const localPage=offset=>{const all=entries(state().topics).filter(t=>t.lifecycle==='active'),selected=all.slice(offset,offset+24);return {display:{topics:Object.fromEntries(selected.map(t=>[t.id,t]))},page:{offset,total:all.length,count:selected.length,limit:24,hasMore:offset+selected.length<all.length}};};
    const first=controller.loadPanel?await preparePanel('settings',null,{offset:seed?.offset??0,limit:24,expected:seed?.expected}):localPage(seed?.offset??0);if(!first)return;
    const d=openDialog('合并主题',{wide:true,trigger}),pick=field(d.body,'保留的主题',kept.id,{options:[{value:kept.id,label:kept.name}]}),chosen=new Map(seed?.chosen??[]),rows=el('div'),selected=el('div'),pager=el('div',{class:'pro-actions'}),position=paragraph(d.body,'');let current=first,expired=false;
    paragraph(d.body,'逐页选择保留的主题与合并来源。跨页选择会保留；一次最多合并 100 个来源主题。成员、工作线、别名与排除将一起核对。');d.body.append(rows,selected,pager);
    const preview=button('预览合并',async()=>{
      if(expired)throw Error('stale-pro-panel-review');const sources=[...chosen.keys()].filter(id=>id!==kept.id);if(!sources.length)throw Error('missing-source-topics');
      const result=unwrap(await controller.previewMerge({keepId:kept.id,sourceIds:sources},{expected:d.expected}));if(dialog!==d)return;
      structurePreview('确认合并',result,{before:['保留主题：'+kept.name,...sources.map(id=>'来源主题：'+chosen.get(id))],after:['保留：'+kept.name,'所选来源的全部成员、别名、工作线和排除会一并核对并合并；旧入口继续可达'],trigger,onBack:()=>mergeTopics(kept.id,trigger,{kept,chosen:[...chosen],offset:current.page.offset,expected:d.expected})});
    },{primary:true});d.footer.append(button('取消',()=>closeDialog()),preview);
    const load=async offset=>{try{const panel=controller.loadPanel?await preparePanel('settings',null,{offset,limit:24,expected:d.expected}):localPage(offset);if(panel&&dialog===d){current=panel;paint();}}catch(e){if(dialog===d){expired=true;preview.disabled=true;error(e);}}};
    const paint=()=>{
      const topics=entries(current.display.topics).filter(t=>t.lifecycle==='active');pick.replaceChildren();for(const topic of [kept,...topics.filter(t=>t.id!==kept.id)])pick.append(el('option',{value:topic.id},topic.name));pick.value=kept.id;
      position.textContent='主题 '+(current.page.count?current.page.offset+1:0)+'–'+(current.page.offset+current.page.count)+' / '+current.page.total;
      rows.replaceChildren();for(const topic of topics){const box=check(rows,'合并「'+topic.name+'」',chosen.has(topic.id));box.disabled=topic.id===kept.id;box.addEventListener('change',()=>{if(box.checked){if(chosen.size>=100){box.checked=false;d.error.textContent='一次最多选择 100 个来源主题。已有选择仍保留。';d.error.hidden=false;return;}chosen.set(topic.id,topic.name);}else chosen.delete(topic.id);paintSelected();});}
      paintSelected();pager.replaceChildren();if(current.page.offset>0)pager.append(button('上一页合并主题',()=>load(Math.max(0,current.page.offset-current.page.limit))));if(current.page.hasMore)pager.append(button('下一页合并主题',()=>load(current.page.offset+current.page.count)));
    };
    const paintSelected=()=>{selected.replaceChildren();paragraph(selected,'已选择 '+chosen.size+' 个合并来源');for(const [id,name]of chosen)selected.append(button('取消合并「'+name+'」',()=>{chosen.delete(id);paint();}));};
    pick.addEventListener('change',()=>{const topic=entries(current.display.topics).find(t=>t.id===pick.value);if(topic){kept={id:topic.id,name:topic.name};chosen.delete(kept.id);paint();}});paint();
  }
  async function splitTopic(retainId,trigger,seed=null) {
    if(seed&&!sameReview(seed.expected,snapshot().versions))throw Error('stale-pro-panel-review');
    const first=await preparePanel('topic',retainId,{offset:seed?.offset??0,limit:24,expected:seed?.expected});if(!first)return;
    const source=state().topics[retainId],d=openDialog('拆分主题',{wide:true,trigger}),children=el('div'),assignment=el('div'),pager=el('div',{class:'pro-actions'}),names=[],selects=new Map(),chosen=new Map(seed?.chosen??[]),labels=new Map(seed?.labels??[]);let currentOffset=seed?.offset??0;
    paragraph(d.body,'逐页选择需要移动的成员。未选择的成员继续留在原主题；被锁定的关系需要先明确解除锁定。');d.body.append(children,assignment,pager);
    const refresh=()=>{for(const [refId,pick]of selects){const selected=chosen.get(refId)??'';pick.replaceChildren(el('option',{value:''},'保留在「'+source.name+'」'));names.forEach((n,i)=>pick.append(el('option',{value:String(i)},n.value.trim()||'新主题 '+(i+1))));pick.value=selected;}};
    const add=(value='')=>{if(names.length>=100)throw Error('split-child-capacity');const input=field(children,'新主题 '+(names.length+1)+' 名称',value);names.push(input);input.addEventListener('input',refresh);refresh();};for(const value of seed?.names??[''])add(value);
    const paint=panel=>{
      assignment.replaceChildren();pager.replaceChildren();selects.clear();
      const current=panel?.display??state(),memberships=entries(current.placements).filter(p=>p.topicId===retainId&&p.state==='included');
      for(const p of memberships){const title=(panel?.items??snapshot().references).find(r=>r.id===p.conversationId)?.nativeTitle??titleOf(snapshot(),p.conversationId),pick=field(assignment,title+(p.control.locked?' · 已锁定':''),'',{options:[]});selects.set(p.conversationId,pick);pick.addEventListener('change',()=>{if(pick.value===''){chosen.delete(p.conversationId);labels.delete(p.conversationId);}else{chosen.set(p.conversationId,pick.value);labels.set(p.conversationId,title);}});}
      refresh();
      if(panel?.page?.offset>0)pager.append(button('上一页拆分成员',()=>load(Math.max(0,panel.page.offset-panel.page.limit))));
      if(panel?.page?.hasMore)pager.append(button('下一页拆分成员',()=>load(panel.page.offset+panel.page.count)));
      if(panel?.page)paragraph(pager,'当前页 '+panel.page.count+' 位成员 · 共 '+panel.page.total+' 位');
    };
    const load=async offset=>{const panel=await preparePanel('topic',retainId,{offset,limit:24,expected:d.expected});if(panel&&dialog===d){currentOffset=offset;paint(panel);}};
    paint(first===true?null:first);actions(children,button('增加一个新主题',()=>add()));
    d.footer.append(button('取消',()=>closeDialog()),button('预览拆分',async()=>{
      const childInput=names.map((n,i)=>({draftKey:'split_'+i,name:n.value.trim(),members:[...chosen].filter(([,index])=>index===String(i)).map(([id])=>id)})).filter(c=>c.members.length);if(!childInput.length)throw Error('missing-split-members');if(childInput.some(c=>!c.name))throw Error('missing-name');
      const result=unwrap(await controller.previewSplit({retainId,children:childInput},{expected:d.expected}));if(dialog!==d)return;
      structurePreview('确认拆分',result,{before:[source.name,...[...chosen.keys()].map(id=>labels.get(id)??titleOf(snapshot(),id))],after:['其余成员保留在「'+source.name+'」',...childInput.flatMap(c=>['新主题：'+c.name,...c.members.map(id=>'  '+(labels.get(id)??titleOf(snapshot(),id)))])],trigger,onBack:()=>splitTopic(retainId,trigger,{names:names.map(n=>n.value),chosen:[...chosen],labels:[...labels],offset:currentOffset,expected:d.expected})});
    },{primary:true}));
  }
  async function seriesList(topicId,trigger,offset=0) {
    const remotePanel=controller.loadPanel?await preparePanel('series',topicId,{offset,limit:24}):true;if(!remotePanel)return;
    const d=openDialog('工作线 · Series',{trigger}),items=entries(remotePanel?.display?.series??state().series).filter(s=>s.topicId===topicId);
    paragraph(d.body,'工作线表达人工确认的连续关系。相似主题、发现先后和标题数字不会自动变成顺序。');
    for(const item of items){const row=el('div',{class:'pro-list-item'});row.append(el('h3',{},item.title));
      if(controller.loadPanel){paragraph(row,(item.totalEntries??item.entries.length)+' 个窗口');actions(row,button('查看工作线：'+item.title,()=>viewSeries(item.id,topicId,trigger)));if(canEdit())actions(row,button('编辑工作线：'+item.title,()=>editSeries(topicId,item,trigger)));}
      else{for(const refId of item.entries){const label=item.labels.find(l=>l.refId===refId)?.sequence;row.append(button((label?label.join('.')+' · ':'')+titleOf(snapshot(),refId),()=>openReference(refId,{origin:'topic',topicId,seriesId:item.id})));}if(canEdit())actions(row,button('编辑工作线',()=>editSeries(topicId,item,trigger)));}
      d.body.append(row);
    }
    if(!items.length)paragraph(d.body,'还没有工作线。你可以从当前主题的成员开始。');
    if(remotePanel?.page?.offset>0)d.footer.append(button('上一页工作线',()=>seriesList(topicId,trigger,Math.max(0,offset-remotePanel.page.limit))));
    if(remotePanel?.page?.hasMore)d.footer.append(button('下一页工作线',()=>seriesList(topicId,trigger,offset+remotePanel.page.count)));
    d.footer.append(button('完成',()=>closeDialog()));if(canEdit())d.footer.append(button('建立工作线',()=>editSeries(topicId,null,trigger),{primary:true}));else paragraph(d.body,readOnlyMessage());
  }
  async function viewSeries(seriesId,topicId,trigger,offset=0) {
    const panel=await preparePanel('series-detail',seriesId,{offset,limit:24});if(!panel)return;
    const item=state().series[seriesId];if(!item)throw Error('series-unavailable');
    const d=openDialog(item.title,{trigger});paragraph(d.body,(item.totalEntries??item.entries.length)+' 个窗口 · 已保存的顺序和分支保持不变。');
    for(const refId of item.entries){const label=item.labels.find(l=>l.refId===refId)?.sequence,row=el('div',{class:'pro-list-item'});row.append(button((label?label.join('.')+' · ':'')+titleOf(snapshot(),refId),()=>openReference(refId,{origin:'topic',topicId,seriesId})));if(canEdit()&&controller.previewSeriesEdit)actions(row,button('调整：'+titleOf(snapshot(),refId),()=>editSeriesEntry(item,refId,trigger,offset)));d.body.append(row);}
    if(item.detailsComplete===false)paragraph(d.body,'逐页查看与调整这条工作线。每次调整都会核对完整关系，再一起保存。');
    else if(canEdit())d.footer.append(button('编辑工作线',()=>editSeries(topicId,item,trigger)));
    if(canEdit()&&controller.previewSeriesEdit)actions(d.body,button('修改工作线名称',()=>renameSeries(item,trigger,offset)),button('加入主题成员',()=>chooseSeriesMember(item,trigger)),button('全部接续与分支',()=>seriesEdges(item,trigger)));else if(controller.loadPanel)actions(d.body,button('全部接续与分支',()=>seriesEdges(item,trigger)));
    if(panel.page.offset>0)d.footer.append(button('前一页窗口',()=>viewSeries(seriesId,topicId,trigger,Math.max(0,offset-panel.page.limit))));
    if(panel.page.hasMore)d.footer.append(button('后一页窗口',()=>viewSeries(seriesId,topicId,trigger,offset+panel.page.count)));
    d.footer.append(button('返回工作线列表',()=>seriesList(topicId,trigger)),button('完成',()=>closeDialog()));
  }

  async function previewSeriesChange(item,change,{dialog:source,before,after,trigger,onBack}) {
    const plan=unwrap(await controller.previewSeriesEdit({seriesId:item.id,change},{expected:source.expected}));
    if(dialog!==source)return;
    structurePreview('确认工作线调整',plan,{before,after,trigger,onBack});
  }
  function renameSeries(item,trigger,offset=0) {
    const d=openDialog('修改工作线名称',{trigger}),name=field(d.body,'工作线名称',item.title);
    d.footer.append(button('取消',()=>viewSeries(item.id,item.topicId,trigger,offset)),button('预览名称',()=>previewSeriesChange(item,{kind:'rename',title:name.value.trim()},{dialog:d,before:[item.title],after:[name.value.trim()],trigger,onBack:()=>renameSeries(item,trigger,offset)}),{primary:true}));
  }
  function editSeriesEntry(item,refId,trigger,offset=0) {
    const title=titleOf(snapshot(),refId),label=item.labels.find(l=>l.refId===refId)?.sequence??null,d=openDialog('调整工作线窗口',{trigger}),sequence=field(d.body,'显示序号（留空表示分支或断点）',label?.join('.')??'');
    paragraph(d.body,title,'pro-original');paragraph(d.body,'显示位置、序号和接续关系分别保存。移动位置不会重编号，也不会自动创建接续。');
    const preview=(change,before,after)=>previewSeriesChange(item,change,{dialog:d,before,after,trigger,onBack:()=>viewSeries(item.id,item.topicId,trigger,offset)});
    actions(d.body,button('预览序号',()=>{const raw=sequence.value.trim();if(raw&&!/^\d+(?:\.\d+){0,11}$/.test(raw))throw Error('invalid-sequence');const value=raw?raw.split('.').map(Number):null;if(value?.some(x=>!Number.isSafeInteger(x)))throw Error('invalid-sequence');return preview({kind:'set-label',refId,sequence:value},[title+' · '+(label?.join('.')??'分支或断点')],[title+' · '+(value?.join('.')??'分支或断点')]);}),button('前移一个位置',()=>preview({kind:'move',refId,direction:'up'},[title+' · 当前位置'],[title+' · 向前一个位置','既有序号、接续和分支保留'])),button('后移一个位置',()=>preview({kind:'move',refId,direction:'down'},[title+' · 当前位置'],[title+' · 向后一个位置','既有序号、接续和分支保留'])));
    actions(d.body,button('建立接续或分支',()=>chooseSeriesEdge(item,refId,title,trigger)),button('查看全部关系',()=>seriesEdges(item,trigger)));
    paragraph(d.body,'移除窗口会一并移除连接到它的接续与分支；其他窗口和原生聊天保留，断点不会自动补连。');
    d.footer.append(button('返回工作线',()=>viewSeries(item.id,item.topicId,trigger,offset)),button('预览移除此窗口',()=>preview({kind:'remove',refId,removeIncidentEdges:true},[title+' · 在工作线中'],['移除：'+title,'移除连接到此窗口的全部接续和分支','保留其余关系和断点']),{danger:true}));
  }
  async function chooseSeriesMember(item,trigger,offset=0) {
    const panel=await preparePanel('topic',item.topicId,{offset,limit:24});if(!panel)return;
    const d=openDialog('加入工作线',{trigger}),members=(panel.items??[]).filter(ref=>ref.available&&entries(panel.display.placements).some(p=>p.topicId===item.topicId&&p.conversationId===ref.id&&p.state==='included'));
    paragraph(d.body,'选择已收录的主题成员。新窗口加在末尾，序号留空；接续和分支需要另行确认。');
    for(const ref of members)d.body.append(button(ref.nativeTitle,()=>previewSeriesChange(item,{kind:'insert',refId:ref.id,beforeRefId:null},{dialog:d,before:[item.title],after:['末尾加入：'+ref.nativeTitle,'保留其他窗口、序号和关系'],trigger,onBack:()=>chooseSeriesMember(item,trigger,offset)})));
    if(!members.length)paragraph(d.body,'这一页没有可加入的主题成员。');
    if(panel.page.offset>0)d.footer.append(button('上一页成员',()=>chooseSeriesMember(item,trigger,Math.max(0,offset-panel.page.limit))));
    if(panel.page.hasMore)d.footer.append(button('下一页成员',()=>chooseSeriesMember(item,trigger,offset+panel.page.count)));
    d.footer.append(button('返回工作线',()=>viewSeries(item.id,item.topicId,trigger)));
  }
  async function chooseSeriesEdge(item,from,fromTitle,trigger,offset=0) {
    const panel=await preparePanel('series-detail',item.id,{offset,limit:24});if(!panel)return;
    const selected=panel.display.series[item.id],d=openDialog('建立接续或分支',{trigger});paragraph(d.body,'从：'+fromTitle);paragraph(d.body,'接续需要唯一的前后关系。分支窗口请使用层级序号或留空。完整图会在预览时检查环路。');
    for(const to of selected.entries.filter(refId=>refId!==from)){const title=titleOf(snapshot(),to),row=el('div',{class:'pro-list-item'});row.append(el('h3',{},title));for(const [relation,name]of [['continuation','接续'],['branch','分支']])actions(row,button(name+'到：'+title,()=>previewSeriesChange(item,{kind:'set-edge',from,to,relation},{dialog:d,before:[fromTitle,title],after:[name+'：'+fromTitle+' → '+title,'其他关系和显示序号保留'],trigger,onBack:()=>chooseSeriesEdge(item,from,fromTitle,trigger,offset)})));d.body.append(row);}
    if(panel.page.offset>0)d.footer.append(button('前一页窗口',()=>chooseSeriesEdge(item,from,fromTitle,trigger,Math.max(0,offset-panel.page.limit))));
    if(panel.page.hasMore)d.footer.append(button('后一页窗口',()=>chooseSeriesEdge(item,from,fromTitle,trigger,offset+panel.page.count)));
    d.footer.append(button('返回工作线',()=>viewSeries(item.id,item.topicId,trigger)));
  }
  async function seriesEdges(item,trigger,offset=0) {
    const panel=await preparePanel('series-edges',item.id,{offset,limit:24});if(!panel)return;
    const selected=panel.display.series[item.id],d=openDialog('全部接续与分支',{trigger});paragraph(d.body,'共 '+selected.totalEdges+' 条关系。逐条核对与调整，不会推断缺失的接续。');
    for(const edge of selected.edges){const description=(edge.kind==='branch'?'分支：':'接续：')+titleOf(snapshot(),edge.from)+' → '+titleOf(snapshot(),edge.to),row=el('div',{class:'pro-list-item'});paragraph(row,description);if(canEdit())actions(row,button('移除：'+description,()=>previewSeriesChange(item,{kind:'remove-edge',from:edge.from,to:edge.to,relation:edge.kind},{dialog:d,before:[description],after:['移除这条关系','所有窗口、序号与其他关系保留'],trigger,onBack:()=>seriesEdges(item,trigger,offset)})));d.body.append(row);}
    if(!selected.edges.length)paragraph(d.body,'没有已确认的接续或分支。');
    if(panel.page.offset>0)d.footer.append(button('上一页关系',()=>seriesEdges(item,trigger,Math.max(0,offset-panel.page.limit))));
    if(panel.page.hasMore)d.footer.append(button('下一页关系',()=>seriesEdges(item,trigger,offset+panel.page.count)));
    d.footer.append(button('返回工作线',()=>viewSeries(item.id,item.topicId,trigger)));
  }

  async function editSeries(topicId,existing,trigger,seed=null) {
    if(!canEdit())return seriesList(topicId,trigger);if(seed&&!sameReview(seed.expected,snapshot().versions))throw Error('stale-pro-panel-review');
    if(controller.loadPanel){const selected=existing?.id;const panel=await preparePanel(selected?'series-detail':'topic',selected??topicId,{offset:0,limit:selected?200:100});if(!panel)return;if(selected){existing=state().series[selected];if(!existing)throw Error('series-unavailable');if(existing.detailsComplete===false)return viewSeries(selected,topicId,trigger);}}
    const d=openDialog(existing?'编辑工作线':'建立工作线',{wide:true,trigger}),title=field(d.body,'工作线名称',seed?.title??existing?.title??state().topics[topicId]?.name??''),available=[...new Set(entries(state().placements).filter(p=>p.topicId===topicId&&p.state==='included').map(p=>p.conversationId))];
    let order=seed?[...seed.order]:existing?[...existing.entries]:[...available],edges=seed?structuredClone(seed.edges):existing?structuredClone(existing.edges):order.slice(1).map((id,i)=>({kind:'continuation',from:order[i],to:id})),labels=seed?structuredClone(seed.labels):existing?structuredClone(existing.labels):order.map((id,i)=>({refId:id,sequence:[i+1],source:'human-confirmed'}));
    paragraph(d.body,'显示位置、序号与接续关系分别保存。移动位置保留已有序号；移除中间项保留断点，新增接续与分支需要明确选择。');
    const rows=el('div');d.body.append(rows);
    const paintRows=()=>{rows.replaceChildren();order.forEach((refId,i)=>{const row=el('div',{class:'pro-order-row'});row.append(el('span',{class:'title'},(labels.find(l=>l.refId===refId)?.sequence?.join('.')??'分支')+' · '+titleOf(snapshot(),refId)));const move=delta=>{const at=i+delta;if(at<0||at>=order.length)return;[order[i],order[at]]=[order[at],order[i]];paintRows();};const up=button('上移 '+titleOf(snapshot(),refId),()=>move(-1),{icon:'↑'}),down=button('下移 '+titleOf(snapshot(),refId),()=>move(1),{icon:'↓'});up.disabled=i===0;down.disabled=i===order.length-1;row.append(up,down,button('移除 '+titleOf(snapshot(),refId),()=>{order=order.filter(id=>id!==refId);edges=edges.filter(e=>e.from!==refId&&e.to!==refId);labels=labels.filter(l=>l.refId!==refId);paintRows();},{icon:'close'}));rows.append(row);});for(const e of edges)paragraph(rows,(e.kind==='branch'?'分支：':'接续：')+titleOf(snapshot(),e.from)+' → '+titleOf(snapshot(),e.to));};paintRows();
    if(available.length){const addRef=field(d.body,'加入成员',available[0],{options:available.map(id=>({value:id,label:titleOf(snapshot(),id)}))});actions(d.body,button('加入工作线',()=>{if(!order.includes(addRef.value)){order.push(addRef.value);labels.push({refId:addRef.value,sequence:null,source:'human-confirmed'});paintRows();}}));}
    const graph=el('div');d.body.append(graph);const options=available.map(id=>({value:id,label:titleOf(snapshot(),id)})),from=field(graph,'从',options[0]?.value??'',{options}),to=field(graph,'到',options[1]?.value??'',{options}),kind=field(graph,'关系','continuation',{options:[{value:'continuation',label:'接续'},{value:'branch',label:'相关分支'}]});actions(graph,button('确认这条关系',()=>{if(!order.includes(from.value)||!order.includes(to.value))throw Error('series-entry-unavailable');edges=edges.filter(e=>!(e.from===from.value&&e.to===to.value));edges.push({kind:kind.value,from:from.value,to:to.value});if(kind.value==='branch')labels=labels.map(label=>label.refId===to.value?{...label,sequence:null}:label);paintRows();}),button('移除这条关系',()=>{edges=edges.filter(e=>!(e.from===from.value&&e.to===to.value));paintRows();}));
    d.footer.append(button('取消',()=>closeDialog()),button('预览工作线',async()=>{if(!title.value.trim())throw Error('missing-name');const plan=unwrap(await controller.previewSeries({seriesId:existing?.id??null,topicId,title:title.value.trim(),entries:order,edges,labels},{expected:d.expected}));if(dialog!==d)return;structurePreview('确认工作线',plan,{before:existing?existing.entries.map(id=>titleOf(snapshot(),id)):['尚未建立'],after:[title.value.trim(),...order.map(id=>(labels.find(l=>l.refId===id)?.sequence?.join('.')??'分支或断点')+' · '+titleOf(snapshot(),id)),...edges.map(e=>(e.kind==='branch'?'分支：':'接续：')+titleOf(snapshot(),e.from)+' → '+titleOf(snapshot(),e.to))],trigger,onBack:()=>editSeries(topicId,existing,trigger,{title:title.value,order:[...order],edges:structuredClone(edges),labels:structuredClone(labels),expected:d.expected})});},{primary:true}));
  }
  function proposalDetails(proposal) {
    if(Array.isArray(proposal.details))return proposal.details;
    const topicName=id=>state().topics[id]?.name??'已保存主题',reference=id=>titleOf(snapshot(),id);
    if(proposal.kind==='derived-title'&&proposal.refId)return ['当前聊天：'+reference(proposal.refId),'整理标题：'+proposal.title];
    if(proposal.kind==='existing-topic'&&proposal.refId)return ['聊天：'+reference(proposal.refId),(proposal.role==='related'?'关联到：':'主主题：')+topicName(proposal.topicId)];
    if(proposal.kind==='new-topic'&&proposal.name)return ['新主题：'+proposal.name,...(proposal.members??[]).map(id=>'收录：'+reference(id))];
    if(proposal.kind==='multi-topic'&&proposal.refId)return ['聊天：'+reference(proposal.refId),'主主题：'+topicName(proposal.primary),...(proposal.related??[]).map(id=>'也关联到：'+topicName(id))];
    return [];
  }
  async function openSuggestions(trigger,offset=0,existing=false) {
    if(!existing&&status().modelAvailability==='unavailable'){const unavailable=openDialog('整理建议',{trigger});paragraph(unavailable.body,'尚未配置整理模型。可以继续手动创建主题、修改名称与管理工作线；云调用与费用保持关闭。');unavailable.footer.append(button('查看已保存建议',()=>openSuggestions(trigger,0,true)),button('完成',()=>closeDialog()));return;}
    const loading=openDialog('整理建议',{trigger});paragraph(loading.body,existing?'正在读取已保存的建议…':'正在核对可整理的标题…');loading.panel.setAttribute('aria-busy','true');loading.footer.append(button('关闭',()=>closeDialog()));
    try{const started=!existing?unwrap(await controller.suggest()):null;if(dialog!==loading)return;const remotePanel=controller.loadPanel?await preparePanel('suggestions',null,{offset,limit:24}):true;if(!remotePanel||dialog!==loading)return;loading.panel.removeAttribute('aria-busy');loading.body.replaceChildren();loading.footer.replaceChildren();const d=loading;d.expected=structuredClone(snapshot().versions);paragraph(d.body,status().fixture?'当前建议来自标明的本地规则夹具。只使用获准标题，没有读取正文或调用云模型。':'目前可以先整理对话标题。先核对建议，再决定是否应用。');
    if(!canSave())paragraph(d.body,'当前建议仅在本次临时预览中保留，不会保存或修改整理资料。解锁浏览器本地个人空间后，请重新核对并生成建议。','pro-warning');
    const proposals=entries(remotePanel?.display?.proposals??state().proposals).filter(r=>['proposed','validated','awaiting-review','stale'].includes(r.state)),selected=[];
    for(const record of proposals){const p=record.proposal,row=el('div',{class:'pro-list-item'});row.append(el('h3',{},p.summary));for(const detail of proposalDetails(p))paragraph(row,detail,'pro-original');for(const why of p.rationale??[])paragraph(row,why);
      if(record.state==='stale'||p.reviewUnavailable){paragraph(row,p.reviewUnavailable==='structure-review-required'?'这项建议涉及主题或工作线结构，不能在此直接应用。请从主题设置重新预览结构、核对冲突后确认；也可以不采用这项建议。':p.reviewUnavailable?'这项历史建议涉及较多成员，当前无法完整核对，暂不能应用。可以不采用它，再根据当前内容分批整理。':'这项建议之后已有变化，不能直接应用。可以保留现有整理，或根据当前内容重新评估。','pro-warning');if(canSave())actions(row,button(record.state==='stale'?'不采用过期建议':'不采用这项建议',()=>dispatch({type:'REJECT_PROPOSAL',proposalId:p.id},d.expected)));if(canPreview())actions(row,button('重新评估建议',()=>openSuggestions(trigger,0,false)));}
      else if(p.kind==='unknown'){paragraph(row,'证据还不充分，继续保留原名。');if(canSave())actions(row,button('不采用',()=>dispatch({type:'REJECT_PROPOSAL',proposalId:p.id},d.expected)));}
      else if(canEdit()){const include=check(row,'纳入本次整理',true);selected.push({proposal:p,include});actions(row,button('应用建议',async()=>{unwrap(await controller.applyProposal(p.id,p.planHash));if(dialog===d)closeDialog();notify('建议已保存，可在整理记录中撤销。');await render();}),button('不采用',()=>dispatch({type:'REJECT_PROPOSAL',proposalId:p.id},d.expected)));}
      else if(canSave()){paragraph(row,readOnlyMessage());actions(row,button('不采用',()=>dispatch({type:'REJECT_PROPOSAL',proposalId:p.id},d.expected)));}d.body.append(row);
    }
    if(!proposals.length)paragraph(d.body,started?.state==='registered'?'整理任务已建立。结果就绪后可在此核对；你可以继续使用工作区。':'目前没有新的可应用建议。已有主题和人工决定保持不变。');if(controller.getModelStatus){d.footer.append(button('模型与整理任务',()=>modelSettings(trigger)));if(status().processingMode==='cloud')d.footer.append(button('刷新已生成建议',()=>openSuggestions(trigger,offset,true)));}if(remotePanel?.page?.offset>0)d.footer.append(button('上一页建议',()=>openSuggestions(trigger,Math.max(0,offset-remotePanel.page.limit),true)));if(remotePanel?.page?.hasMore)d.footer.append(button('下一页建议',()=>openSuggestions(trigger,offset+remotePanel.page.count,true)));d.footer.append(button('完成',()=>closeDialog()));
    if(selected.length&&controller.applyProposalBatch)d.footer.append(button('应用所选整理',async()=>{const items=selected.filter(x=>x.include.checked).map(x=>({proposalId:x.proposal.id,planHash:x.proposal.planHash}));if(!items.length)throw Error('empty-proposal-batch');unwrap(await controller.applyProposalBatch(items));if(dialog===d)closeDialog();notify('所选整理已一起保存，可完整撤销。');await render();},{primary:true}));
    }catch(e){if(dialog===loading){loading.panel.removeAttribute('aria-busy');loading.body.replaceChildren();paragraph(loading.body,'这次整理没有完成。已保存资料与人工操作仍可使用。');loading.footer.replaceChildren(button('完成',()=>closeDialog()));error(e);}}
  }
  function displayPatch(patch) {
    if(typeof patch.label==='string')return patch.label;
    const s=state(),snap=snapshot(),value=patch.after??patch.before,label=patch.after===null?'移除：':'';
    if(patch.kind==='placement'&&value)return label+titleOf(snap,value.conversationId)+' → '+(s.topics[value.topicId]?.name??'已保存主题')+' · '+(value.role==='primary'?'主收录':'关联');
    if(patch.kind==='derived-title'&&value)return label+titleOf(snap,value.conversationId)+' → '+(value.displayPreference==='native'?'持续显示原名':value.title??'保留原名');
    if(patch.kind==='constraint'&&value){if(value.kind==='exclude-topic')return label+'排除「'+titleOf(snap,value.refId)+'」→「'+(s.topics[value.topicId]?.name??'主题')+'」';if(value.kind==='exclude-ai-processing')return label+'不参与 AI 整理：'+titleOf(snap,value.refId);if(value.kind==='reject-proposal')return label+'不再推荐相同依据的整理';}
    if(patch.kind==='redirect'&&value)return label+(s.topics[value.fromTopicId]?.name??'旧主题')+' → '+(s.topics[value.toTopicId]?.name??'保留主题');
    return label+(value?.name??value?.title??(value?.conversationId?titleOf(snap,value.conversationId):value?.refId?titleOf(snap,value.refId):s.topics[patch.key]?.name)??({topic:'主题',placement:'收录关系','derived-title':'整理标题',constraint:'人工设置',series:'工作线',redirect:'旧主题入口'}[patch.kind]??'整理内容'));
  }
  async function legacyUpgrade(trigger) {
    const d=openDialog('检查旧版整理升级',{trigger});paragraph(d.body,'先核对当前个人空间中已保存的旧版整理，再决定是否升级。旧版主题、名称、锁定与排除会保留；有歧义的主主题会留待你确认。');
    d.footer.append(button('取消',()=>closeDialog()),button('检查可升级资料',async()=>{
      const plan=unwrap(await controller.previewLegacyUpgrade({expected:d.expected}));if(dialog!==d)return;
      if(plan.state==='unavailable'){d.body.replaceChildren();paragraph(d.body,plan.message??'当前没有可升级的旧版整理。');d.footer.replaceChildren(button('完成',()=>closeDialog()));return;}
      const review=openDialog('确认旧版整理升级',{trigger});paragraph(review.body,plan.summary||'检查已完成。确认后会保存当前空间中的旧版整理。');paragraph(review.body,'升级不会读取聊天正文，也不会开启模型。完成后仍可通过统一备份恢复资料。');
      review.footer.append(button('取消',()=>closeDialog()),button('确认升级',async()=>{unwrap(await controller.applyStructure(plan));closeDialog();notify('旧版整理已升级。有歧义的主主题可以在整理设置中逐条确认。');await render();},{primary:true}));
    },{primary:true}));
  }
  async function openRecords(trigger,offset=0) {
    const d=openDialog('整理记录',{trigger}),operations=await controller.getOperations({offset,limit:24});if(dialog!==d)return;
    paragraph(d.body,'撤销先核对整个操作。只要其中有后续修改，原撤销就不会写入任何部分。');
    for(const op of [...operations].reverse()){
      const row=el('div',{class:'pro-list-item'});row.append(el('h3',{},(op.actor==='automation'?'自动整理':'人工操作')+' · '+(op.status==='undone'?'已撤销':'已保存')));
      for(const p of op.changes??op.patch??[])paragraph(row,displayPatch(p));
      if(op.changesTruncated)paragraph(row,'这次操作的变更较多。可以逐页核对完整清单，然后一次撤销整笔操作。');
      if(op.status==='applied'&&canSave()){
        if(op.changesTruncated&&controller.beginOperationReview)actions(row,button('逐页核对整笔撤销',()=>openOperationReview(op,trigger,d.expected)));
        else if(!op.changesTruncated)actions(row,button('检查撤销',async()=>{const preview=unwrap(await controller.previewUndo(op.operationId,{expected:d.expected}));if(dialog!==d)return;showUndo(op,preview,trigger);}));
      }
      d.body.append(row);
    }
    if(!operations.length)paragraph(d.body,'还没有整理变化。');const page=controller.getPanelPage?.();
    if(page?.offset>0)d.footer.append(button('较新的记录',()=>openRecords(trigger,Math.max(0,page.offset-page.limit))));
    if(page?.hasMore)d.footer.append(button('较早的记录',()=>openRecords(trigger,page.offset+page.count)));
    d.footer.append(button('完成',()=>closeDialog()));
  }
  async function openOperationReview(operation,trigger,expected) {
    const d=openDialog('逐页核对整笔撤销',{trigger,wide:true}),info=paragraph(d.body,'正在核对这笔操作…'),items=el('div'),progress=paragraph(d.body,''),pager=el('div',{class:'pro-actions'});
    d.body.append(items,pager);d.footer.append(button('取消',()=>closeDialog()));
    const review=unwrap(await controller.beginOperationReview(operation.operationId,{expected}));if(dialog!==d)return;
    info.textContent=review.state==='ready'?'逐页查看本次操作的全部变化。完整清单展示后，确认会一起撤销整笔操作。':'这笔操作之后已有修改，当前不能整笔撤销。可以继续核对变化；已有资料保持原样。';
    let reviewedUntil=0,total=null,expired=false,pageRun=0;const offsets=[];
    const apply=button('确认整笔撤销',async()=>{if(expired||total===null||reviewedUntil!==total||review.state!=='ready')throw Error('incomplete-operation-review');unwrap(await controller.applyStructure(review));closeDialog();notify('已完整撤销整笔操作。');await render();},{primary:true});apply.disabled=true;d.footer.append(apply);
    const load=async offset=>{
      const run=++pageRun;apply.disabled=true;
      try{
        if(offset>reviewedUntil||expired)throw Error('stale-pro-operation-review');
        const page=await controller.loadOperationReview(review,{offset,limit:24});if(dialog!==d||run!==pageRun)return;
        if(page.actor!==operation.actor||page.operationStatus!==operation.status||total!==null&&total!==page.page.total)throw Error('invalid-pro-operation-review');
        total=page.page.total;items.replaceChildren();for(const change of page.changes)paragraph(items,displayPatch(change));
        if(!offsets.includes(offset))offsets.push(offset);offsets.sort((a,b)=>a-b);
        reviewedUntil=Math.max(reviewedUntil,page.page.offset+page.page.count);progress.textContent='已展示 '+reviewedUntil+' / '+total+' 项变化';
        pager.replaceChildren();const previous=offsets.filter(x=>x<offset).at(-1);if(previous!==undefined)pager.append(button('上一页变化',()=>load(previous)));
        if(page.page.hasMore)pager.append(button('下一页变化',()=>load(page.page.offset+page.page.count)));
        apply.disabled=review.state!=='ready'||reviewedUntil!==total||!canSave();
      }catch(e){if(dialog===d&&run===pageRun){expired=true;apply.disabled=true;pager.replaceChildren(button('重新核对这笔操作',()=>openOperationReview(operation,trigger,snapshot().versions)));error(e);}}
    };
    await load(0);
  }
  function showUndo(op,preview,trigger) {const d=openDialog(preview.state==='ready'?'撤销这次整理':'之后有修改',{trigger});if(preview.state==='ready'){paragraph(d.body,'本次操作的全部变更将一起撤销。原生内容与授权不受影响。');for(const p of op.changes??op.patch??[])paragraph(d.body,displayPatch(p));d.footer.append(button('取消',()=>closeDialog()),button('确认撤销',async()=>{unwrap(await controller.undo(op.operationId,preview.inverseHash));closeDialog();notify('已完整撤销。');await render();},{primary:true}));}else{paragraph(d.body,'这次撤销与后续修改冲突，目前没有写入任何更改。可以保留现状，或明确选择需要补偿的字段。','pro-warning');const selections=[];for(const p of op.changes??op.patch??[]){const conflicted=(preview.conflicts??[]).some(c=>c.kind===p.kind&&c.key===p.key),input=check(d.body,displayPatch(p)+(conflicted?' · 之后有修改':''),false);selections.push({patch:p,input});}d.footer.append(button('保留现状',()=>closeDialog()));if(controller.previewCompensation)d.footer.append(button('预览选定补偿',async()=>{const restoreKeys=selections.filter(x=>x.input.checked).map(x=>({kind:x.patch.kind,key:x.patch.key}));if(!restoreKeys.length)throw Error('empty-compensation');const plan=unwrap(await controller.previewCompensation(op.operationId,{restoreKeys,expected:d.expected})),c=openDialog('确认新的补偿',{wide:true,trigger});previewColumns(c.body,(plan.changes??plan.patch??[]).map(p=>displayPatch({...p,after:p.before})),(plan.changes??plan.patch??[]).map(p=>displayPatch(p)));paragraph(c.body,'这是基于当前资料的新操作，原操作不会被标记为已撤销。只有以上选定内容会改变。');c.footer.append(button('取消',()=>closeDialog()),button('确认补偿',async()=>{if(plan.previewId){await controller.applyStructure(plan);closeDialog();await render();}else return dispatch({type:'APPLY_COMPENSATION_PLAN',plan},plan.expected);},{primary:true}));}));}}
  async function projectScopeChoices(d,st) {
    const localPage=offset=>{const all=snapshot().projects?.length?snapshot().projects:lastNative?.groups?.items??[],selected=all.slice(offset,offset+24);return {projects:selected.map(p=>({id:p.id,name:p.nativeName??p.name})),page:{offset,total:all.length,count:selected.length,limit:24,hasMore:offset+selected.length<all.length}};};
    const first=controller.loadPanel?await preparePanel('project-choices',null,{offset:0,limit:24,expected:d.expected}):localPage(0);if(!first||dialog!==d)return;
    const selected=new Map((st.selectedProjectIds??[]).map(id=>[id,null])),rows=el('div'),saved=el('div'),position=paragraph(d.body,''),pager=el('div',{class:'pro-actions'});let current=first,expired=false;
    paragraph(d.body,'逐页选择原生项目。已选择但不在当前页的项目会保留；一次最多选择 100 个项目。');d.body.append(rows,saved,pager);
    const apply=button('应用所选项目范围',async()=>{if(expired||!sameReview(d.expected,snapshot().versions))throw Error('stale-pro-panel-review');if(!selected.size)throw Error('empty-project-scope');await controller.setMode('pro-cross-project',{selectedProjectIds:[...selected.keys()]});closeDialog();await render();});
    actions(d.body,button('只整理无 Project 聊天',async()=>{await controller.setMode('pro-default-none');closeDialog();await render();}),apply);
    const load=async offset=>{try{const panel=controller.loadPanel?await preparePanel('project-choices',null,{offset,limit:24,expected:d.expected}):localPage(offset);if(panel&&dialog===d){current=panel;paint();}}catch(e){if(dialog===d){expired=true;apply.disabled=true;error(e);}}};
    const paintSaved=()=>{saved.replaceChildren();paragraph(saved,'已选择 '+selected.size+' 个原生项目');let unnamed=0;for(const [id,name]of selected){if(name)saved.append(button('移除所选原生项目「'+name+'」',()=>{selected.delete(id);paint();}));else unnamed++;}if(unnamed)paragraph(saved,'另有 '+unnamed+' 个已选项目尚未载入名称，请翻页核对；这些选择会继续保留。');apply.disabled=expired||!selected.size;};
    const paint=()=>{rows.replaceChildren();for(const project of current.projects){if(selected.has(project.id))selected.set(project.id,project.name);const box=check(rows,'包含原生项目「'+project.name+'」',selected.has(project.id));box.addEventListener('change',()=>{if(box.checked){if(selected.size>=100){box.checked=false;d.error.textContent='一次最多选择 100 个原生项目。已有选择仍保留。';d.error.hidden=false;return;}selected.set(project.id,project.name);}else selected.delete(project.id);paintSaved();});}position.textContent='原生项目 '+(current.page.count?current.page.offset+1:0)+'–'+(current.page.offset+current.page.count)+' / '+current.page.total;paintSaved();pager.replaceChildren();if(current.page.offset>0)pager.append(button('上一页原生项目',()=>load(Math.max(0,current.page.offset-current.page.limit))));if(current.page.hasMore)pager.append(button('下一页原生项目',()=>load(current.page.offset+current.page.count)));};paint();
    paragraph(d.body,'范围选择只增加虚拟引用，不会移动原生聊天，也不扩大正文读取或云端处理许可。');
  }
  async function settings(trigger) {if(!await preparePanel('settings',null,{limit:100}))return;const d=openDialog('整理设置',{trigger}),st=status();paragraph(d.body,canSave()?'人工主题、名称、查找、备份和恢复可以直接使用。':readOnlyMessage());d.body.append(el('h3',{class:'pro-subhead'},'整理方式'));paragraph(d.body,st.fixture?'本地规则夹具 · 未连接真实模型':st.processingMode==='cloud'?'已授权模型整理':st.modelAvailability==='unavailable'?'模型尚未配置':'本地标题规则');if(!controller.getModelStatus)paragraph(d.body,'云调用关闭；费用上限为 0。');paragraph(d.body,st.processingMode==='cloud'?'当前模型只处理已获准的标题与别名。任务状态与费用可以随时核对。':st.modelAvailability==='unavailable'?'当前仅启用人工整理。配置模型及处理用途后，才会开放自动建议。':'本地整理只使用获准的标题与别名，不读取正文，也不调用云模型。');if(controller.getModelStatus)actions(d.body,button('模型与整理任务',()=>modelSettings(trigger)));if(controller.setLocalProcessing&&st.modelAvailability!=='unavailable'){const localButton=button(st.processingMode==='local'?'暂停本地整理':st.processingMode==='cloud'?'暂停模型整理':'允许本地标题整理',async()=>{unwrap(await controller.setLocalProcessing(st.processingMode==='local'||st.processingMode==='cloud'?'off':'local'));closeDialog();await render();notify(st.processingMode==='local'||st.processingMode==='cloud'?'整理已暂停。':'已允许本地标题整理，可以查看建议。');});localButton.disabled=st.processingMode==='off'&&!canPreview();actions(d.body,localButton);}d.body.append(el('h3',{class:'pro-subhead'},'整理范围'));await projectScopeChoices(d,st);if(dialog!==d)return;const unresolved=entries(state().legacyResolutions).filter(r=>r.status==='primary-resolution-required');if(controller.loadPanel||unresolved.length){d.body.append(el('h3',{class:'pro-subhead'},'历史整理'));paragraph(d.body,'原有名称、关系与锁定完整保留。多条关系需要你明确选择主主题，也可以暂不指定。');if(controller.loadPanel)actions(d.body,button('核对历史整理',()=>openLegacyResolutions(trigger)));else for(const r of unresolved)actions(d.body,button('核对：'+titleOf(snapshot(),r.refId),()=>legacyPrimary(r.refId,trigger)));}d.body.append(el('h3',{class:'pro-subhead'},'已保存资料'));actions(d.body,button('查看已保存建议',()=>openSuggestions(trigger,0,true)));if(controller.previewLegacyUpgrade&&canSave())actions(d.body,button('检查旧版整理升级',()=>legacyUpgrade(trigger)));if(controller.openBackup&&canSave())actions(d.body,button('备份与恢复',()=>{closeDialog();return controller.openBackup();}));if(controller.exportBackup)actions(d.body,button('导出整理备份',async()=>{const backup=unwrap(await controller.exportBackup());const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:'vaiwl-pro-backup.json'});a.click();URL.revokeObjectURL(url);notify('已导出整理备份。');}));if(controller.restoreBackup){const upload=field(d.body,'恢复整理备份','',{type:'file'});upload.accept='.json,application/json';actions(d.body,button('检查并恢复备份',async()=>{const f=upload.files?.[0];if(!f)throw Error('missing-backup');if(f.size>16*1024*1024)throw Error('backup-too-large');const data=JSON.parse(await f.text());unwrap(await controller.restoreBackup(data));closeDialog();await render();notify('整理数据已恢复。模型工作仍需重新核对许可，不会自动运行。');}));}if(st.fixture&&controller.restart){d.body.append(el('h3',{class:'pro-subhead'},'离线恢复验证'));paragraph(d.body,'此入口只用于隔离样本，重新创建运行实例并恢复已提交资料。');actions(d.body,button('重启离线样本',async()=>{unwrap(await controller.restart());closeDialog();await render();notify('已重新读取保存的整理资料。');}));}d.footer.append(button('完成',()=>closeDialog()));}
  async function openAliases(kind,targetId,trigger,offset=0) {
    const intent=++panelIntent;
    let page;if(controller.getAliases)page=await controller.getAliases(kind,targetId,{offset,limit:24});else{const all=(kind==='topic'?state().topics[targetId]:state().titles[targetId])?.aliases??[],aliases=all.slice(offset,offset+24);page={versions:snapshot().versions,aliases,page:{offset,limit:24,count:aliases.length,total:all.length,hasMore:offset+aliases.length<all.length}};}
    if(destroyed||intent!==panelIntent||status().authorized===false)return;
    if(!sameReview(page.versions,snapshot().versions))throw Error('stale-pro-alias-review');
    const d=openDialog('历史名称',{trigger});d.expected=structuredClone(page.versions);paragraph(d.body,'旧名称用于查找。移除不会改动当前名称、原生聊天、锁定或历史操作；这次移除也可以撤销。');
    for(const alias of page.aliases){const row=el('div',{class:'pro-list-item'});paragraph(row,alias,'pro-original');if(canSave())actions(row,button('移除历史名称：'+alias,()=>{const confirm=openDialog('移除历史名称',{trigger});confirm.expected=structuredClone(d.expected);paragraph(confirm.body,alias,'pro-original');paragraph(confirm.body,'这个旧名称将不再参与查找。当前名称、聊天与其他历史名称保持不变。');confirm.footer.append(button('取消',()=>openAliases(kind,targetId,trigger,offset)),button('确认移除历史名称',async()=>{await dispatch({type:'REMOVE_ALIAS',target:kind==='topic'?{kind:'topic-name',topicId:targetId}:{kind:'title',refId:targetId},alias},confirm.expected);if(!dialog&&!destroyed)await openAliases(kind,targetId,trigger,Math.max(0,page.page.count===1&&offset>0?offset-page.page.limit:offset));},{danger:true}));}));d.body.append(row);}
    if(!page.aliases.length)paragraph(d.body,'目前没有保留的历史名称。');else paragraph(d.body,'历史名称 '+(page.page.offset+1)+'–'+(page.page.offset+page.page.count)+' / '+page.page.total);
    if(page.page.offset>0)d.footer.append(button('上一页历史名称',()=>openAliases(kind,targetId,trigger,Math.max(0,page.page.offset-page.page.limit))));if(page.page.hasMore)d.footer.append(button('下一页历史名称',()=>openAliases(kind,targetId,trigger,page.page.offset+page.page.count)));d.footer.append(button('完成',()=>closeDialog()));
  }
  const microsInput=value=>{const amount=BigInt(value),fraction=String(amount%1000000n).padStart(6,'0').replace(/0+$/u,'');return String(amount/1000000n)+(fraction?'.'+fraction:'');};
  const budgetMoney=value=>{const [whole,fraction='']=microsInput(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/gu,',')+'.'+fraction.padEnd(2,'0');};
  function parseBudgetAmount(value){
    const text=value.normalize('NFKC').trim();if(text.length>32||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(text))throw Error('invalid-budget-amount');
    const [whole,fraction='']=text.split('.'),micros=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
    if(micros>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid-budget-amount');return Number(micros);
  }
  function budgetPeriods(parent,periods){
    const utc=value=>typeof value==='string'?value.replace('T',' ').replace(/\.\d{3}Z$/u,' UTC').replace(/Z$/u,' UTC'):'尚未建立';
    paragraph(parent,'每日周期（UTC）：'+utc(periods?.dayFrom)+' — '+utc(periods?.dayThrough));
    paragraph(parent,'每月周期（UTC）：'+utc(periods?.monthFrom)+' — '+utc(periods?.monthThrough));
  }
  async function modelBudgetSettings(trigger,{saved=null,draft=null}={}){
    const d=openDialog('调整模型费用额度',{trigger});paragraph(d.body,'正在读取当前费用额度…');d.footer.append(button('取消',()=>modelSettings(trigger)));d.panel.setAttribute('aria-busy','true');
    try{
      const reply=saved??unwrap(await controller.getModelBudget());if(dialog!==d)return;
      if(reply?.kind!=='pro-model-budget'||!sameReview(reply.versions,snapshot().versions))throw Error('stale-pro-model-budget');
      const settings=reply.settings;d.expected=structuredClone(reply.versions);d.body.replaceChildren();
      if(!settings.configured){paragraph(d.body,'尚未配置获准模型与价格卡，不能设置云费用。本地标题整理和人工操作仍可使用。');return;}
      paragraph(d.body,'额度约束本次安装中的所有空间；它不是每个空间分别获得的一笔新额度。币种：'+settings.currency+'。');budgetPeriods(d.body,settings.periods);
      if(!canEdit()){paragraph(d.body,'当前只能查看已有费用和暂停整理，不能提高或修改额度。');return;}
      const fields=[['每项任务上限','taskMicros'],['每日总额','dayMicros'],['每月总额','monthMicros']].map(([label,key])=>{
        const input=field(d.body,label+'（'+settings.currency+'）',draft?.[key]??microsInput(settings.limits[key]));input.setAttribute('inputmode','decimal');input.setAttribute('autocomplete','off');input.setAttribute('spellcheck','false');return {label,key,input};
      });
      paragraph(d.body,'每项任务的模型许可上限：'+settings.currency+' '+budgetMoney(settings.taskMaximumMicros)+'。金额最多保留六位小数。');
      paragraph(d.body,'额度为 0 时不允许相应云整理。队列可用额度由日/月余额推导，并扣除已预留和结果未知的费用，不另设一笔队列额度。');
      const previewButton=button('预览额度',async()=>{
        if(!canEdit()||!sameReview(d.expected,snapshot().versions))throw Error('stale-pro-model-budget');
        const values=Object.fromEntries(fields.map(({key,input})=>[key,input.value])),limits=Object.fromEntries(fields.map(({key,input})=>[key,parseBudgetAmount(input.value)]));
        if(limits.taskMicros>settings.taskMaximumMicros)throw Error('budget-task-limit');
        const preview=unwrap(await controller.previewModelBudget(limits,{expected:d.expected}));if(dialog!==d)return;
        if(preview?.kind!=='pro-model-budget-preview'||!sameReview(preview.expected,d.expected)||!sameReview(preview.expected,snapshot().versions))throw Error('stale-pro-model-budget');
        const review=openDialog('确认费用额度',{trigger});review.expected=structuredClone(preview.expected);
        paragraph(review.body,'请核对本次安装的费用额度。币种：'+preview.currency+'；价格卡版本：'+preview.priceCardVersion+'。');
        for(const {label,key}of fields)paragraph(review.body,label+'：'+preview.currency+' '+budgetMoney(preview.before[key])+' → '+preview.currency+' '+budgetMoney(preview.after[key]),'pro-original');
        if(fields.some(({key})=>preview.after[key]>preview.before[key]))paragraph(review.body,'本次包含额度提升，只有明确确认后才会保存。');
        if(fields.some(({key})=>preview.after[key]===0))paragraph(review.body,'至少一项额度为 0，新的云整理将保持暂停。');
        paragraph(review.body,'已占用、预留或结果未知的费用继续计入余额，不因调整额度或切换空间而清零。');
        paragraph(review.body,'保存会暂停云整理，不会发起模型请求。需要重新核对数据用途与费用后，才能再次启用。');
        review.footer.append(button('返回调整',()=>modelBudgetSettings(trigger,{saved:reply,draft:values})),button('取消',()=>modelSettings(trigger)),button('确认保存额度',async()=>{
          if(!canEdit()||!sameReview(preview.expected,snapshot().versions))throw Error('stale-pro-model-budget');
          unwrap(await controller.configureModelBudget(preview));if(dialog===review)await modelSettings(trigger,{message:'费用额度已保存，云整理保持暂停。再次启用前，请重新确认数据用途与费用。'});
        },{primary:true}));
      },{primary:true});
      d.footer.append(previewButton);for(const {input}of fields)input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();previewButton.click();}});
    }catch(e){if(dialog===d)error(e);}finally{if(dialog===d)d.panel.removeAttribute('aria-busy');}
  }
  async function confirmModelProcessing(trigger,{refIds=null,reviewOnly=false,onCancel=null}={}) {
    const d=openDialog(reviewOnly?'精细复核这条聊天':'确认云整理范围',{trigger});paragraph(d.body,'正在读取这次整理的数据示例、接收方、保留政策与费用上限…');
    d.footer.append(button('取消',()=>onCancel?onCancel():modelSettings(trigger)));d.panel.setAttribute('aria-busy','true');
    try {
      const preview=unwrap(await controller.previewModel({refIds,reviewOnly}));if(dialog!==d)return;
      d.body.replaceChildren();
      if(preview?.kind!=='pro-model-preview'){paragraph(d.body,preview?.message??'当前无法取得完整的模型用途说明，云整理保持关闭。可以继续使用本地标题规则。');return;}
      if(preview.reviewOnly!==reviewOnly||!sameReview(preview.expected,snapshot().versions))throw Error('stale-model-preview');
      const policyURL=new URL(preview.policyUrl);if(policyURL.protocol!=='https:'||policyURL.username||policyURL.password)throw Error('model-disclosure-unavailable');
      d.expected=structuredClone(preview.expected);
      d.body.append(el('h3',{class:'pro-subhead'},'发送给谁'));
      paragraph(d.body,preview.provider+' · '+preview.model);
      d.body.append(el('h3',{class:'pro-subhead'},'这次允许处理的数据'));
      paragraph(d.body,'仅包含当前获准的聊天标题、历史名称与候选主题名称，不包含聊天正文。下列示例来自这次实际预览。');
      for(const item of preview.sample){const row=el('div',{class:'pro-list-item'});paragraph(row,item.title,'pro-original');if(item.aliases.length)paragraph(row,'历史名称：'+item.aliases.join('、'));else paragraph(row,'这条聊天没有发送历史名称。');d.body.append(row);}
      paragraph(d.body,'展示 '+preview.sample.length+' / '+preview.sampleTotal+' 条聊天的数据示例。');
      if(preview.topicNames.length)paragraph(d.body,'候选主题示例：'+preview.topicNames.join('、'));
      paragraph(d.body,'展示 '+preview.topicNames.length+' / '+preview.topicTotal+' 个候选主题名称。');
      if(preview.truncated)paragraph(d.body,'这次最小数据投影包含省略内容。省略部分不会补读或扩大已确认的处理范围。');
      d.body.append(el('h3',{class:'pro-subhead'},'数据保留政策'));
      paragraph(d.body,preview.retentionText);paragraph(d.body,'政策版本：'+preview.policyVersion);
      d.body.append(el('a',{href:policyURL.href,target:'_blank',rel:'noopener noreferrer',class:'pro-note'},'查看服务方数据保留政策'));
      d.body.append(el('h3',{class:'pro-subhead'},'本次费用上限'));
      const money=value=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6}).format(value/1e6);
      paragraph(d.body,'本次最高预留：'+preview.currency+' '+money(preview.maximumMicros));
      paragraph(d.body,'每项任务许可上限：'+preview.currency+' '+money(preview.taskLimitMicros));
      paragraph(d.body,'安装预算继续约束所有任务。未确认的已发送费用不会自动退回；费用额度不足时不会发送。');
      if(preview.withinBudget!==true){paragraph(d.body,'当前剩余额度不足以预留这次整理的最高费用，暂不能确认。请先核对费用额度与待核对费用，再重新预览。','pro-warning');if(controller.getModelBudget&&controller.previewModelBudget&&controller.configureModelBudget)d.footer.append(button('查看与调整额度',()=>modelBudgetSettings(trigger)));}
      const automatic=!reviewOnly&&preview.automaticAvailable===true?check(d.body,'自动应用当前范围内符合质量门的低风险建议',false):null;
      const background=reviewOnly?null:check(d.body,'切换到原生视图后继续当前范围的整理',false);
      if(reviewOnly)paragraph(d.body,'仅使用上方当前冻结模型复核这一条聊天，不会暗中切换到费用更高的模型。结果只成为待审建议，不自动应用，也不改变日常整理方式。');
      else{paragraph(d.body,automatic?'保持不勾选时只生成待审建议。勾选也只允许当前范围内通过独立质量门的低风险操作；稳定主主题、已有名称与结构变更仍需确认。':'当前没有获准的自动整理资格。本次只生成待审建议，应用前需要你确认。');
        paragraph(d.body,'未选择自动整理时，点击整理建议启动任务；选择后，当前获准范围中的新来源可以触发有界整理。你可以随时暂停；改变范围、预算或用途后需要重新确认。');
        paragraph(d.body,'原生视图中的继续整理也只在当前文档许可仍有效时进行。关闭浏览器或工作进程结束后，不会保持持续运行。');}
      const confirm=button(reviewOnly?'确认并开始精细复核':'确认启用这次云整理范围',async()=>{
        if(!sameReview(preview.expected,snapshot().versions)||!canEdit())throw Error('stale-model-preview');
        if(reviewOnly){const result=unwrap(await controller.startModelReview(preview));if(dialog===d)await modelSettings(trigger,{message:result.message??'精细复核任务已建立。请在整理建议中核对结果；日常整理方式保持原样。'});}
        else{unwrap(await controller.enableModel(preview,{automatic:automatic?.checked===true,backgroundWhileNative:background?.checked===true}));if(dialog===d)await modelSettings(trigger);}
      },{primary:true});confirm.disabled=preview.withinBudget!==true;d.footer.append(confirm);
    } catch(e) {if(dialog===d)error(e);} finally {if(dialog===d)d.panel.removeAttribute('aria-busy');}
  }
  async function modelSettings(trigger,{message=null}={}) {
    const d=openDialog('模型与整理任务',{trigger});paragraph(d.body,'正在读取当前整理方式与任务…');let serial=0,modelOffset=0;
    const names={queued:'等待整理',reserved:'已预留费用',dispatched:'已发送，等待结果','result-ready':'结果已取回',validated:'结果已核对','awaiting-review':'等待你核对',committed:'已有建议应用',paused:'已暂停',cancelled:'已取消',stale:'输入已变化',failed:'整理未完成','outcome-unknown':'这次结果还未取回'};
    const reasonText=reason=>reason==='budget'?'当前费用额度不足，已有整理仍可使用。':reason==='consent'?'处理用途尚未许可，当前不会发送内容。':reason==='foreground-priority'?'优先保留正在进行的操作。':reason==='capability'?'当前没有可用的整理来源或模型授权。':reason?'这次任务尚未完成，已保存的整理不受影响。':null;
    const refresh=async(action=null,offset=modelOffset)=>{const ticket=++serial;d.panel.setAttribute('aria-busy','true');try{if(action)unwrap(await action());if(dialog!==d||ticket!==serial)return;const [modelRead,budgetRead]=await Promise.allSettled([controller.getModelStatus({offset,limit:20}),controller.getModelBudget?controller.getModelBudget():Promise.resolve(null)]);if(dialog!==d||ticket!==serial)return;if(modelRead.status==='rejected')throw modelRead.reason;const reply=unwrap(modelRead.value);let settings=null,budgetUnavailable=budgetRead.status==='rejected';if(budgetRead.status==='fulfilled'&&budgetRead.value)try{const budget=unwrap(budgetRead.value);if(budget.kind!=='pro-model-budget'||!sameReview(budget.versions,snapshot().versions))throw Error('stale-pro-model-budget');settings=budget.settings;}catch{budgetUnavailable=true;}modelOffset=reply.model.page?.offset??0;paint(reply.model,settings,budgetUnavailable);}catch(e){if(dialog===d&&ticket===serial)error(e);}finally{if(dialog===d&&ticket===serial)d.panel.removeAttribute('aria-busy');}};
    const setProcessing=async mode=>{unwrap(await controller.setLocalProcessing(mode));if(dialog===d)await refresh();};
    const paint=(model,settings=null,budgetUnavailable=false)=>{
      d.error.hidden=true;d.body.replaceChildren();d.footer.replaceChildren();
      if(message)paragraph(d.body,message,'pro-read-only');
      paragraph(d.body,model.configured?'已连接：'+model.provider+' · '+model.model:'尚未连接外部模型。');
      paragraph(d.body,model.configured?(model.enabled?'模型连接与用途已获授权，启用后仅处理当前获准的标题与别名。':'连接配置已保存，模型执行许可尚未就绪。当前不会发送内容。'):'连接模型后，需要分别确认整理内容与费用额度。本地标题规则无需联网。');
      paragraph(d.body,'本地规则根据标题给出初步建议，应用前可以逐项核对。');if(model.automaticEnabled)paragraph(d.body,'当前获准范围中的低风险整理已经过独立准入，可以按既有许可自动应用。稳定主主题、已有名称与结构变更仍需确认；自动变化保留记录与撤销。');
      if(model.automaticEnabled)paragraph(d.body,'当前获准范围中的新来源可以触发有界整理；也可以主动查看整理建议。');
      paragraph(d.body,model.backgroundWhileNative===true?'已允许切换到原生视图后继续当前范围的整理，仍需当前文档许可有效。关闭浏览器或工作进程结束后不会持续运行。':'切换到原生视图会暂停云整理。若希望继续，请在重新确认整理范围时明确选择。');
      const st=status(),choices=el('div',{class:'pro-actions'});d.body.append(choices);
      if(!canSave())paragraph(d.body,'当前为临时预览。本地建议不会持久保存，外部模型保持关闭。');
      if(controller.setLocalProcessing){for(const [label,mode]of [['暂停整理','off'],['使用本地标题规则','local']]){const pick=button(label,()=>setProcessing(mode));pick.disabled=st.processingMode===mode||(mode!=='off'&&!canPreview());pick.setAttribute('aria-pressed',String(st.processingMode===mode));choices.append(pick);}
        if(model.enabled&&controller.previewModel&&controller.enableModel){const cloud=button('使用已授权模型',()=>confirmModelProcessing(trigger));cloud.disabled=st.processingMode==='cloud'||!canEdit();cloud.setAttribute('aria-pressed',String(st.processingMode==='cloud'));choices.append(cloud);}}
      if(controller.getModelBudget){
        d.body.append(el('h3',{class:'pro-subhead'},'费用额度'));
        if(budgetUnavailable)paragraph(d.body,'费用额度暂时无法读取。可以刷新核对；本地整理和暂停操作仍可使用。','pro-warning');
        else if(!settings?.configured)paragraph(d.body,'尚未配置获准模型与价格卡，不能设置云费用。本地标题整理和人工操作仍可使用。');
        else{
          paragraph(d.body,'额度适用于本次安装中的所有空间；已结算、预留与结果未知的费用都计入已占用金额。');
          for(const [label,key]of [['每项任务上限','taskMicros'],['每日总额','dayMicros'],['每月总额','monthMicros']])paragraph(d.body,label+'：'+settings.currency+' '+budgetMoney(settings.limits[key]));
          budgetPeriods(d.body,settings.periods);
          paragraph(d.body,'本日已占用：'+settings.currency+' '+budgetMoney(settings.usage.dayMicros)+'；本日剩余：'+settings.currency+' '+budgetMoney(settings.remaining.dayMicros));
          paragraph(d.body,'本月已占用：'+settings.currency+' '+budgetMoney(settings.usage.monthMicros)+'；本月剩余：'+settings.currency+' '+budgetMoney(settings.remaining.monthMicros));
          paragraph(d.body,'队列可用额度（已扣预留与待核对费用）：'+settings.currency+' '+budgetMoney(settings.remaining.queueMicros));
          if(settings.remaining.queueMicros<Math.min(settings.remaining.dayMicros,settings.remaining.monthMicros))paragraph(d.body,'队列可用额度还受到可信付款配置的其他限额约束。');
          if(settings.nearLimit)paragraph(d.body,'已临近费用上限。可以先暂停整理，或明确调整额度后再继续。','pro-warning');
          if(settings.blocked)paragraph(d.body,'当前额度为零或不足以开始新的云整理。人工操作和本地标题规则仍可使用。','pro-warning');
          const budgetActions=[];
          if(settings.nearLimit&&controller.setLocalProcessing){const pause=button('暂停模型整理',()=>setProcessing('off'));pause.disabled=st.processingMode==='off';budgetActions.push(pause);}
          if(controller.previewModelBudget&&controller.configureModelBudget){const adjust=button('调整额度',()=>modelBudgetSettings(trigger));adjust.disabled=!canEdit();budgetActions.push(adjust);}
          if(budgetActions.length)actions(d.body,...budgetActions);
          if(!canEdit())paragraph(d.body,'当前只能查看已有费用和暂停整理，不能提高或修改额度。');
        }
      }
      d.body.append(el('h3',{class:'pro-subhead'},'费用记录'));
      const money=value=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6}).format(value/1e6),budget=model.budget;
      if(budget.currency)for(const [label,key]of [['已结算','settled'],['已预留','reserved'],['待核对','uncertain']])paragraph(d.body,label+'：'+budget.currency+' '+money(budget[key]));else paragraph(d.body,'当前没有已配置的模型费用。');
      if(budget.blocked)paragraph(d.body,'费用额度暂不可用，新的模型整理已暂停。','pro-warning');
      paragraph(d.body,'这里显示本次安装记录的费用。已发送但结果未知的任务保留预留费用，不会自动重发。');
      d.body.append(el('h3',{class:'pro-subhead'},'整理任务'));
      if(!model.jobs.length)paragraph(d.body,'目前没有模型任务。已有人工整理可以继续使用。');
      for(const job of model.jobs){const row=el('div',{class:'pro-list-item'});row.append(el('h3',{},names[job.state]??'正在核对状态'));const why=reasonText(job.reason);if(why)paragraph(row,why);
        if(job.state==='outcome-unknown')paragraph(row,'可能已经计费。请先核对服务方结果与账单；这里不会再次发送这项请求。');
        if(job.state==='dispatched')paragraph(row,'停止等待也可能已产生费用。结果未确认时会保留预留金额。');
        if(controller.cancelModelJob&&['queued','reserved','dispatched','paused','result-ready','validated','awaiting-review','failed','stale'].includes(job.state)){const finish=['paused','result-ready','validated','awaiting-review','failed','stale'].includes(job.state);if(finish)paragraph(row,'结束任务不会删除已经保存的建议或整理，也不会退回已结算费用。');actions(row,button(job.state==='dispatched'?'停止等待':finish?'结束任务':'取消这次整理',()=>refresh(()=>controller.cancelModelJob(job.id))));}
        if(job.state==='committed')paragraph(row,'这次任务已有建议被采用。其余内容是否仍待核对，请以整理建议中的当前状态为准。');if(['awaiting-review','committed'].includes(job.state))actions(row,button('查看已生成建议',()=>openSuggestions(trigger,0,true)));d.body.append(row);
      }
      if(model.page){const p=model.page;paragraph(d.body,'任务 '+(p.count?p.offset+1:0)+'–'+(p.offset+p.count)+' / '+p.total);if(p.offset>0)d.footer.append(button('上一页任务',()=>refresh(null,Math.max(0,p.offset-p.limit))));if(p.hasMore)d.footer.append(button('下一页任务',()=>refresh(null,p.offset+p.count)));}
      else if(model.totalJobs>model.jobs.length)paragraph(d.body,'当前显示 '+model.jobs.length+' 项，共 '+model.totalJobs+' 项任务。较早的费用与结果继续保留。');
      if(controller.recoverModelJobs&&model.jobs.some(job=>['dispatched','outcome-unknown','queued','reserved'].includes(job.state)))actions(d.body,button('核对中断任务',()=>refresh(()=>controller.recoverModelJobs())));
      if(controller.recoverModelJobs&&model.jobs.some(job=>['awaiting-review','validated','result-ready'].includes(job.state))){paragraph(d.body,'已经采用的建议可以核对保存结果；只读取操作收据，不重新发送模型请求或再次应用整理。');actions(d.body,button('核对已保存结果',()=>refresh(()=>controller.recoverModelJobs())));}
      d.footer.append(button('刷新任务状态',()=>refresh()),button('完成',()=>closeDialog()));
    };
    d.footer.append(button('重试读取',()=>refresh()),button('完成',()=>closeDialog()));await refresh();
  }
  async function openLegacyResolutions(trigger,offset=0) {
    const panel=await preparePanel('legacy-resolutions',null,{offset,limit:24});if(!panel)return;
    const d=openDialog('核对历史整理',{trigger}),rows=entries(panel.display.legacyResolutions);
    paragraph(d.body,'只列出尚未确认主主题的历史整理。逐条确认后会从清单移除，原有名称与关系继续保留。');
    paragraph(d.body,'待核对 '+panel.page.total+' 条 · 当前 '+(panel.page.count?panel.page.offset+1:0)+'–'+(panel.page.offset+panel.page.count));
    for(const item of rows)actions(d.body,button('核对：'+titleOf(snapshot(),item.refId),()=>legacyPrimary(item.refId,trigger,{onReturn:()=>openLegacyResolutions(trigger,panel.page.offset)})));
    if(!rows.length)paragraph(d.body,'没有待核对的历史主主题。');
    if(panel.page.offset>0)d.footer.append(button('上一页历史整理',()=>openLegacyResolutions(trigger,Math.max(0,panel.page.offset-panel.page.limit))));
    if(panel.page.hasMore)d.footer.append(button('下一页历史整理',()=>openLegacyResolutions(trigger,panel.page.offset+panel.page.count)));
    d.footer.append(button('完成',()=>closeDialog()));
  }
  async function legacyPrimary(refId,trigger,{onReturn=null}={}) {
    if(!await preparePanel('reference',refId,{limit:100}))return;
    const resolution=state().legacyResolutions[refId];if(!resolution||resolution.status!=='primary-resolution-required')return onReturn?.();const d=openDialog('核对历史主主题',{trigger});paragraph(d.body,titleOf(snapshot(),refId),'pro-original');paragraph(d.body,'历史关系没有保存主次。所有原有关系与锁定仍保留，只有你的明确选择会确定主主题。');
    const options=[{value:'',label:'暂不指定主主题'},...resolution.candidates.map(id=>({value:id,label:state().topics[id]?.name??'已保存主题'}))],pick=field(d.body,'主主题','',{options});
    for(const p of resolution.preservedPlacements??[])paragraph(d.body,(state().topics[p.workspaceId??p.topicId]?.name??'已保存主题')+(p.locked||p.control?.locked?' · 原锁定保留':''));
    d.footer.append(button('暂时保留',()=>onReturn?onReturn():closeDialog()),button('预览选择',async()=>{const plan=unwrap(await controller.previewLegacyPrimary(refId,pick.value||null,{expected:d.expected})),c=openDialog('确认历史主主题',{trigger});paragraph(c.body,plan.chosenPrimary?'主主题：'+state().topics[plan.chosenPrimary].name:'暂不指定主主题。聊天仍在原名入口，全部关系保留为关联。');paragraph(c.body,'原有人工锁保持，其他成员不变。');c.footer.append(button('取消',()=>onReturn?onReturn():closeDialog()),button('确认选择',async()=>{await dispatch({type:'RESOLVE_LEGACY_PRIMARY',refId,chosenPrimary:plan.chosenPrimary,preservedAssetDigest:plan.preservedAssetDigest,planHash:plan.planHash},plan.expected);if(onReturn)return onReturn();},{primary:true}));},{primary:true}));
  }
  async function openReference(refId,context) {
    const anchor={cardId:context.topicId??null,refId,segment,scrollOffset:main.scrollTop,openOldItems:[...olderOpen],sidebarChoices:[]},result=unwrap(await controller.open(refId,{...context,returnAnchor:anchor}));
    if(result?.state==='native-link'){
      const target=result.nativeLink;if(!target||target.refId!==refId||target.disposition!=='new-tab-preserve-current')throw Error('native-link-unavailable');
      const d=openDialog('打开原生聊天');paragraph(d.body,'在新标签打开这条聊天，当前页面与草稿会保留。');
      const link=el('a',{href:target.url,target:'_blank',rel:'noopener noreferrer',class:'pro-text-button primary','data-focus-key':'open-native-link'},'在新标签打开');
      d.footer.append(button('取消',()=>closeDialog()),link);return result;
    }
    closeDialog({restoreFocus:false});await render();return result;
  }
  function returnToWorkspace() {
    if(returning)return returning;
    const pending=(async()=>{
      const value=unwrap(await controller.returnToWorkspace()),anchor=value?.anchor??value;if(destroyed)return value;
      if(anchor&&Number.isSafeInteger(anchor.segment)){segment=anchor.segment;olderOpen.clear();for(const id of anchor.openOldItems??[])olderOpen.add(id);if(controller.setSegment)await controller.setSegment(segment);}
      await render();if(!destroyed&&anchor&&Number.isFinite(anchor.scrollOffset))main.scrollTop=anchor.scrollOffset;return value;
    })().finally(()=>{if(returning===pending)returning=null;});
    returning=pending;return pending;
  }
  function row(rowDTO,context={}) {const wrap=el('div',{class:'pro-row-wrap'}),open=button(rowDTO.displayTitle,()=>openReference(rowDTO.refId,context),{key:'ref:'+rowDTO.refId+':'+(context.topicId??'none')});open.className='pro-row';open.textContent='';open.append(el('span',{class:'glyph','aria-hidden':'true'},'▱'),el('span',{class:'label'},rowDTO.displayTitle));open.title=rowDTO.displayTitle;open.disabled=!rowDTO.available;open.dataset.refId=rowDTO.refId;if(status().launchContext?.referenceId===rowDTO.refId)open.setAttribute('aria-current','page');const edit=button('名称与主题：'+rowDTO.displayTitle,b=>editReference(rowDTO.refId,b),{icon:'more',key:'edit:'+rowDTO.refId+':'+(context.topicId??'none')});edit.classList.add('pro-row-actions');wrap.append(open,edit);return wrap;}
  function card(group) {
    const section=el('section',{class:'pro-card','data-topic-id':group.topicId}),head=el('div',{class:'pro-card-head'}),glyph=el('span',{class:'pro-glyph','aria-hidden':'true'});
    glyph.innerHTML=svgIcon(iconPaths[group.icon]?group.icon:defaultIcon(group.name));head.append(glyph,el('h3',{},group.name),button('主题设置：'+group.name,b=>topicSettings(group.topicId,b),{icon:'more',key:'topic:'+group.topicId}));section.append(head);
    const members=el('div',{class:'pro-members'}),remote=controller.loadRows?group.windows?.current:null,cap=remote?group.current.length:(rowLimits.get(group.topicId)??5),offset=remote?0:(rowOffsets.get(group.topicId)??0),visible=[...group.current,...group.undated];
    for(const r of visible.slice(offset,offset+cap))members.append(row(r,{origin:'topic',topicId:group.topicId}));
    if(remote?.offset>0)members.append(button('返回前一页近期窗口',()=>controller.loadRows(group.topicId,'current',{offset:Math.max(0,remote.offset-remote.limit),limit:remote.limit})));
    if(remote?.hasMore)members.append(button('显示更多近期窗口',()=>controller.loadRows(group.topicId,'current',{offset:remote.offset+remote.count,limit:17})));
    if(offset>0){const prev=button('返回前一页近期窗口',()=>{rowOffsets.set(group.topicId,Math.max(0,offset-200));return render();});prev.className='pro-more';members.append(prev);}
    if(visible.length>offset+cap){const more=button(cap>=200?'下一页近期窗口':'显示更多近期窗口',()=>{if(cap>=200)rowOffsets.set(group.topicId,offset+200);else rowLimits.set(group.topicId,Math.min(200,cap+12));return render();});more.className='pro-more';members.append(more);}
    if(group.old.length||group.windows?.old?.total){
      const open=olderOpen.has(group.topicId),older=button((open?'收起':'展开')+'较早窗口：'+group.name,()=>{open?olderOpen.delete(group.topicId):olderOpen.add(group.topicId);return render();});older.className='pro-old';older.textContent=open?'⌄ 较早窗口':'› 较早窗口';older.setAttribute('aria-expanded',String(open));members.append(older);
      if(open){
        const list=el('div',{class:'pro-old-list'}),oldRemote=controller.loadRows?group.windows?.old:null,oldCap=oldRemote?group.old.length:(oldLimits.get(group.topicId)??5),oldOffset=oldRemote?0:(oldOffsets.get(group.topicId)??0);
        for(const r of group.old.slice(oldOffset,oldOffset+oldCap))list.append(row(r,{origin:'topic',topicId:group.topicId}));
        if(oldRemote?.offset>0)list.append(button('返回前一页较早窗口',()=>controller.loadRows(group.topicId,'old',{offset:Math.max(0,oldRemote.offset-oldRemote.limit),limit:oldRemote.limit})));
        if(oldRemote?.hasMore)list.append(button('显示更多较早窗口',()=>controller.loadRows(group.topicId,'old',{offset:oldRemote.offset+oldRemote.count,limit:17})));
        if(oldOffset>0){const previous=button('返回前一页较早窗口',()=>{oldOffsets.set(group.topicId,Math.max(0,oldOffset-200));return render();});previous.className='pro-more';list.append(previous);}
        if(group.old.length>oldOffset+oldCap){const more=button(oldCap>=200?'下一页较早窗口':'显示更多较早窗口',()=>{if(oldCap>=200)oldOffsets.set(group.topicId,oldOffset+200);else oldLimits.set(group.topicId,Math.min(200,oldCap+12));return render();});more.className='pro-more';list.append(more);}
        members.append(list);
      }
    }
    if(group.empty)paragraph(members,'主题已保存，可以收录聊天。','pro-empty');section.append(members);return section;
  }
  function inventory(title,rows) {
    const kind=title==='未收录聊天'?'uncollected':'pending',remote=controller.setInventoryPage?controller.getProjection()?.windows?.[kind]:null;
    if(!rows.length&&!remote?.total)return null;
    const section=el('section',{class:'pro-section pro-inventory'}),cap=remote?rows.length:(inventoryLimits.get(title)??5),offset=remote?0:(inventoryOffsets.get(title)??0);
    section.append(el('h2',{},title));for(const r of rows.slice(offset,offset+cap))section.append(row(r,{origin:'direct',topicId:null}));
    if(remote?.offset>0)section.append(button('返回前一页'+title,()=>controller.setInventoryPage(kind,Math.max(0,remote.offset-remote.limit))));
    if(remote?.hasMore)section.append(button('下一页'+title,()=>controller.setInventoryPage(kind,remote.offset+remote.count)));
    if(offset>0)section.append(button('返回前一页'+title,()=>{inventoryOffsets.set(title,Math.max(0,offset-200));return render();}));
    if(offset+cap<rows.length)section.append(button(cap>=200?'下一页'+title:'显示更多'+title,()=>{if(cap>=200)inventoryOffsets.set(title,offset+200);else inventoryLimits.set(title,Math.min(200,cap+12));return render();}));return section;
  }
  async function mountNative(dto,projectsOnly) {const kind=projectsOnly?'projects':'native';if(nativeKind!==kind){nativeRenderer?.destroy?.();nativeRenderer?.stop?.();nativeRenderer=null;nativeContainer=el('div',{class:'pro-native-container'+(projectsOnly?'':' full')});nativeKind=kind;}if(!nativeRenderer&&controller.mountNativeView)nativeRenderer=await controller.mountNativeView(nativeContainer,{projectsOnly});if(nativeRenderer?.update)await nativeRenderer.update(dto,{projectsOnly});return nativeContainer;}
  async function render() {
    if(destroyed)return;const liveStatus=status(),liveVersions=snapshot().versions,liveScope=liveVersions?.scopeKey;if(liveStatus.authorized===false||lastScope&&(liveScope!==lastScope||liveVersions?.authorizationEpoch!==lastAuthorizationEpoch)){closeDialog({restoreFocus:false});nativeRenderer?.destroy?.();nativeRenderer?.stop?.();nativeRenderer=null;nativeKind=null;nativeContainer=null;main.replaceChildren();if(liveStatus.authorized===false){renderGeneration++;notify('当前整理资料已暂停显示，原生入口仍可使用。');return;}}if(composing||activePointers.size||activeKeys.size){pendingPaint=true;return;}pendingPaint=false;const generation=++renderGeneration;
    try{
      const view=unwrap(await controller.getView({segment,rowLimit:200}));if(destroyed||generation!==renderGeneration)return;
      const st=status(),snap=snapshot(),s=state(),key=snap.versions.scopeKey;lastNative=view.native;
      if(lastScope&&(lastScope!==key||snap.versions.authorizationEpoch!==lastAuthorizationEpoch)){closeDialog({restoreFocus:false});olderOpen.clear();rowLimits.clear();rowOffsets.clear();oldLimits.clear();oldOffsets.clear();inventoryLimits.clear();inventoryOffsets.clear();anchors.clear();segment=0;lastProMode='pro-default-none';lastProProjects=[];}lastScope=key;lastAuthorizationEpoch=snap.versions.authorizationEpoch;
      const focused=shadow.activeElement,focusKey=focused?.dataset.focusKey,scroll=main.scrollTop,mode=view.mode;if(mode!=='native'){lastProMode=mode;lastProProjects=[...(st.selectedProjectIds??[])];}
      toolbar.replaceChildren();const modes=el('div',{class:'pro-mode','aria-label':'工作区视图'});for(const[label,value]of [['主题','pro-default-none'],['原生项目','native']]){const b=button(label,async()=>{anchors.set(mode,{scroll:main.scrollTop,segment});if(value!=='native'&&mode==='native'&&controller.resumePro)await controller.resumePro();else await controller.setMode(value==='native'?'native':lastProMode,{selectedProjectIds:value==='native'?[]:lastProProjects});const a=anchors.get(status().mode);segment=a?.segment??0;if(controller.setSegment&&segment)await controller.setSegment(segment);await render();main.scrollTop=a?.scroll??0;});b.setAttribute('aria-pressed',String(value==='native'?mode==='native':mode!=='native'));modes.append(b);}toolbar.append(modes,el('span',{class:'spacer'}),button('查找',b=>openSearch(null,b),{icon:'search'}),button('整理建议',b=>openSuggestions(b),{icon:'spark'}),button('整理记录',b=>openRecords(b),{icon:'history'}),button('整理设置',b=>settings(b),{icon:'more'}));
      const searchButton=toolbar.querySelector('[aria-label="查找"]');if(searchButton)searchButton.hidden=mode==='native';const organizeButton=toolbar.querySelector('[aria-label="整理建议"]');if(organizeButton)organizeButton.disabled=!canPreview()||mode==='native';if(organizeButton&&st.modelAvailability==='unavailable')organizeButton.title='整理模型尚未配置';
      scopeNotice.textContent=mode==='pro-cross-project'?'包含所选原生项目 · 只建立虚拟引用':mode!=='native'&&st.positiveNone==='unavailable'?'现有聊天的归属还在核对。原生项目与聊天照常可用。':mode!=='native'&&st.processingMode==='off'?'整理已暂停，已有主题与人工操作仍可用。':'';
      if(st.launchContext){const bar=el('div',{class:'pro-reader-return'});bar.append(button('返回工作区',returnToWorkspace,{icon:workspaceReturnIcon,key:'return-workspace'}),el('p',{},'阅读与输入由原生页面保留。'));const series=st.launchContext.seriesId?s.series[st.launchContext.seriesId]:null,next=Object.hasOwn(st.launchContext,'nextReferenceId')?st.launchContext.nextReferenceId:series?nextSeriesEntry(series,st.launchContext.referenceId):null;if(next&&st.launchContext.topicId&&st.launchContext.seriesId)bar.append(button('下一条工作线窗口',()=>openReference(next,{origin:'topic',topicId:st.launchContext.topicId,seriesId:st.launchContext.seriesId})));main.replaceChildren(bar);main.className='pro-body';return;}
      if(mode==='native'){main.className='pro-body native';const native=await mountNative(view.native,false);if(generation!==renderGeneration)return;main.replaceChildren(native);if(!controller.mountNativeView)paragraph(main,'原生视图接线尚未提供，请使用宿主原生入口。');}
      else{
        main.className='pro-body';const fragment=doc.createDocumentFragment();
        if(!canEdit())fragment.append(el('div',{class:'pro-read-only'},readOnlyMessage()));
        if(view.native?.groups?.items?.length){const section=el('section',{class:'pro-section native'});section.append(el('h2',{},'原生项目'));section.append(await mountNative(view.native,true));fragment.append(section);}
        const projection=controller.getProjection?.()??projectTopicGroups(s,snap,{mode,selectedProjectIds:st.selectedProjectIds??[]}),section=el('section',{class:'pro-section'}),cards=el('div',{class:'pro-cards'});section.append(el('h2',{},'主题'));for(const group of projection.groups.filter(g=>g.segment===segment||(g.segment===null&&segment===0)))cards.append(card(group));section.append(cards);if(!cards.childNodes.length)paragraph(section,segment===0?(st.modelAvailability==='unavailable'?'还没有主题。可以手动创建主题，收录已确认归属的聊天。':'还没有主题。可以手动创建，或先查看标题整理建议。'):'这个时间段没有主题，可以查看相邻时间段。');fragment.append(section);
        const decision=id=>snap.activityDecisions?.[id]??snap.references.find(r=>r.id===id)?.activityDecision??{};const inSegment=r=>{const k=decision(r.refId).segment??null;return k===segment||(k===null&&segment===0);};const uncollected=inventory('未收录聊天',controller.getProjection?projection.uncollected:projection.uncollected.filter(inSegment)),pending=inventory('归属待核对',segment===0?projection.pending:[]);if(uncollected)fragment.append(uncollected);if(pending){paragraph(pending,'你仍可以打开和查找这些聊天。归属未确认时不会自动放入主题。');fragment.append(pending);}
        const pager=el('div',{class:'pro-pager'});if(segment>0)pager.append(button('较近的窗口',async()=>{segment--;if(controller.setSegment)await controller.setSegment(segment);main.scrollTop=0;return render();},{icon:'↑'}));const maximum=projection.maxSegment??Math.max(0,...projection.groups.map(g=>g.segment??0),...snap.references.map(r=>decision(r.id).segment??0));if(segment<maximum)pager.append(button('较早的窗口',async()=>{segment++;if(controller.setSegment)await controller.setSegment(segment);main.scrollTop=0;return render();},{icon:'↓'}));const topicPage=controller.getPage?.();if(topicPage?.offset>0)pager.append(button('上一页主题',()=>controller.setPage(Math.max(0,topicPage.offset-topicPage.limit))));if(topicPage?.hasMore)pager.append(button('下一页主题',()=>controller.setPage(topicPage.offset+topicPage.count)));fragment.append(pager);
        const footer=el('div',{class:'pro-footer'});const create=button('新建主题',createTopic,{icon:'plus',key:'create-topic'});create.disabled=!canEdit();footer.append(create,button('查找已知聊天',b=>openSearch(null,b),{icon:'search'}));fragment.append(footer);main.replaceChildren(fragment);
      }
      main.scrollTop=scroll;if(!dialog&&focusKey)[...shadow.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===focusKey)?.focus({preventScroll:true});
    }catch(e){if(generation===renderGeneration){closeDialog({restoreFocus:false});nativeRenderer?.destroy?.();nativeRenderer?.stop?.();nativeRenderer=null;nativeKind=null;nativeContainer=null;main.replaceChildren(el('p',{class:'pro-note'},'当前整理资料暂不可用。原生入口仍可继续使用。'));error(e);}}
  }
  shadow.addEventListener('compositionstart',()=>{composing=true;});shadow.addEventListener('compositionend',()=>{composing=false;flushPaint();});
  shadow.addEventListener('pointerdown',e=>activePointers.add(e.pointerId));const endPointer=e=>{if(activePointers.delete(e.pointerId))flushPaint();};for(const name of ['pointerup','pointercancel','lostpointercapture'])doc.addEventListener(name,endPointer,true);
  shadow.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key))activeKeys.add(e.key);});const endKey=e=>{if(activeKeys.delete(e.key))flushPaint();};doc.addEventListener('keyup',endKey,true);
  const releaseInteractions=()=>{activePointers.clear();activeKeys.clear();composing=false;flushPaint();};doc.defaultView?.addEventListener('blur',releaseInteractions);
  const unsubscribe=controller.subscribe?.(()=>render());
  render();
  const captureView=()=>({scopeKey:snapshot().versions.scopeKey,authorizationEpoch:snapshot().versions.authorizationEpoch,segment,scrollOffset:main.scrollTop,openOldItems:[...olderOpen]});
  async function restoreView(value){const current=snapshot().versions;if(destroyed||value.scopeKey!==current.scopeKey||value.authorizationEpoch!==current.authorizationEpoch)return;segment=value.segment;olderOpen.clear();for(const id of value.openOldItems)olderOpen.add(id);await render();if(!destroyed)main.scrollTop=value.scrollOffset;}
  return Object.freeze({render,openReference,returnToWorkspace,captureView,restoreView,openRecords,openSuggestions,editReference,topicSettings,createTopic,closeDialog,destroy(){destroyed=true;renderGeneration++;unsubscribe?.();if(paintTimer!==null)clearTimeout(paintTimer);for(const name of ['pointerup','pointercancel','lostpointercapture'])doc.removeEventListener(name,endPointer,true);doc.removeEventListener('keyup',endKey,true);doc.defaultView?.removeEventListener('blur',releaseInteractions);closeDialog({restoreFocus:false});nativeRenderer?.destroy?.();nativeRenderer?.stop?.();shadow.replaceChildren();},root:shadow});
}

export function createProSidebar(root,controller) {
  const doc=root.ownerDocument,shadow=root.shadowRoot??root.attachShadow({mode:'open'}),style=doc.createElement('style');style.textContent=proCSS;
  const pane=doc.createElement('nav'),feedback=doc.createElement('p');pane.className='pro-sidebar';pane.setAttribute('aria-label','主题导航');feedback.className='pro-sidebar-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');shadow.replaceChildren(style,pane,feedback);
  const choices=new Map(),olderChoices=new Set(),capacities=new Map(),offsets=new Map(),pointers=new Set(),keys=new Set();
  let destroyed=false,lastScope=null,composing=false,pending=false,timer=null;
  const el=(tag,className,text='')=>{const n=doc.createElement(tag);n.className=className;n.textContent=text;return n;};
  const later=()=>{if(timer!==null)return;timer=setTimeout(()=>{timer=null;if(pending&&!composing&&!pointers.size&&!keys.size){pending=false;render();}},0);};
  const fail=error=>{if(!destroyed&&controller.getStatus().authorized!==false)feedback.textContent=reasonMessage(String(error?.message??error));};
  const control=(label,action,key)=>{const b=el('button','pro-more',label);b.type='button';b.setAttribute('aria-label',label);b.dataset.focusKey=key;let pending=false;b.addEventListener('click',()=>{if(pending)return;pending=true;b.disabled=true;b.setAttribute('aria-busy','true');feedback.textContent='';Promise.resolve().then(action).catch(fail).finally(()=>{pending=false;if(b.isConnected)b.disabled=false;b.removeAttribute('aria-busy');});});return b;};
  const saveAnchor=(group,refId,segment)=>({cardId:group.topicId,refId,segment,scrollOffset:controller.getSidebarViewport?.()??pane.scrollTop,openOldItems:[...olderChoices],sidebarChoices:[...choices].filter(([,open])=>open).map(([id])=>id)});
  function renderRows(parent,rows,group,kind,st) {
    const key=group.topicId+':'+kind,remote=controller.loadRows?group.windows?.[kind]:null,cap=remote?rows.length:(capacities.get(key)??5),offset=remote?0:(offsets.get(key)??0);
    for(const row of rows.slice(offset,offset+cap)){
      const b=el('button','pro-row',row.displayTitle);b.type='button';b.title=row.displayTitle;b.setAttribute('aria-label',row.displayTitle);b.dataset.focusKey='row:'+group.topicId+':'+row.refId;b.dataset.refId=row.refId;b.disabled=!row.available;
      b.addEventListener('click',()=>{const scope=controller.getSnapshot().versions.scopeKey;Promise.resolve().then(()=>controller.open(row.refId,{origin:'topic',topicId:group.topicId,returnAnchor:saveAnchor(group,row.refId,st.segment??0)})).then(reply=>{const result=unwrap(reply);if(destroyed||!b.isConnected||controller.getStatus().authorized===false||controller.getSnapshot().versions.scopeKey!==scope||result?.state!=='native-link'||result.nativeLink?.refId!==row.refId||result.nativeLink.disposition!=='new-tab-preserve-current')return;const link=el('a','pro-row','在新标签打开：'+row.displayTitle);link.href=result.nativeLink.url;link.target='_blank';link.rel='noopener noreferrer';link.dataset.nativeLink=row.refId;parent.querySelector('[data-native-link]')?.remove();b.after(link);}).catch(fail);});
      if(st.launchContext?.referenceId===row.refId)b.setAttribute('aria-current','page');parent.append(b);
    }
    if(remote?.offset>0)parent.append(control('返回前一页'+(kind==='old'?'较早':'近期')+'窗口：'+group.name,()=>controller.loadRows(group.topicId,kind,{offset:Math.max(0,remote.offset-remote.limit),limit:remote.limit}),'previous:'+key));
    if(remote?.hasMore)parent.append(control('显示更多'+(kind==='old'?'较早':'近期')+'窗口：'+group.name,()=>controller.loadRows(group.topicId,kind,{offset:remote.offset+remote.count,limit:17}),'more:'+key));
    if(offset>0)parent.append(control('返回前一页'+(kind==='old'?'较早':'近期')+'窗口：'+group.name,()=>{offsets.set(key,Math.max(0,offset-200));render();},'previous:'+key));
    if(offset+cap<rows.length)parent.append(control((cap>=200?'下一页':'显示更多')+(kind==='old'?'较早':'近期')+'窗口：'+group.name,()=>{if(cap>=200)offsets.set(key,offset+200);else capacities.set(key,Math.min(200,cap+12));render();},'more:'+key));
  }
  function render() {
    if(destroyed)return;const s=controller.getState(),snap=controller.getSnapshot(),st=controller.getStatus();
    if(lastScope!==s.scopeKey){choices.clear();olderChoices.clear();capacities.clear();offsets.clear();pane.replaceChildren();lastScope=s.scopeKey;}
    // Source withdrawal clears private rows immediately even during a pointer gesture.
    if(st.authorized===false||snap.authorized===false){pending=false;pane.replaceChildren();feedback.textContent='';return;}
    if(composing||pointers.size||keys.size){pending=true;return;}
    pending=false;
    const active=shadow.activeElement,focusKey=active?.dataset.focusKey,scroll=pane.scrollTop;
    pane.replaceChildren();if(st.mode==='native')return;
    let groups;try{groups=controller.getProjection?.().groups??projectTopicGroups(s,snap,{mode:st.mode??'pro-default-none',selectedProjectIds:st.selectedProjectIds??[]}).groups;}catch{return;}
    for(const group of groups){
      const block=doc.createElement('details'),summary=doc.createElement('summary'),icon=el('span',''),name=el('span','',group.name),chevron=el('span','chevron','›');
      block.dataset.topicId=group.topicId;icon.innerHTML=svgIcon(iconPaths[group.icon]?group.icon:defaultIcon(group.name));summary.append(icon,name,chevron);summary.dataset.focusKey='summary:'+group.topicId;summary.setAttribute('aria-label','侧栏主题：'+group.name);block.append(summary);
      block.open=choices.get(group.topicId)??st.launchContext?.topicId===group.topicId;
      // Only a user's summary click records an explicit choice. Programmatic
      // default expansion must not turn into a permanent manual open choice.
      summary.addEventListener('click',()=>choices.set(group.topicId,!block.open));
      const list=el('div','pro-members');renderRows(list,[...group.current,...group.undated],group,'current',st);
      if(group.old.length||group.windows?.old?.total){const open=olderChoices.has(group.topicId),toggle=control((open?'收起':'展开')+'较早窗口：'+group.name,()=>{open?olderChoices.delete(group.topicId):olderChoices.add(group.topicId);render();},'old:'+group.topicId);toggle.className='pro-old';toggle.setAttribute('aria-expanded',String(open));list.append(toggle);if(open){const old=el('div','pro-old-list');renderRows(old,group.old,group,'old',st);list.append(old);}}
      if(group.empty)list.append(el('p','pro-note','主题已保存'));block.append(list);pane.append(block);
    }
    const topicPage=controller.getPage?.();if(topicPage?.offset>0)pane.append(control('上一页主题',()=>controller.setPage(Math.max(0,topicPage.offset-topicPage.limit)),'topic-previous'));if(topicPage?.hasMore)pane.append(control('下一页主题',()=>controller.setPage(topicPage.offset+topicPage.count),'topic-next'));
    pane.scrollTop=scroll;
    if(focusKey)[...shadow.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===focusKey)?.focus({preventScroll:true});
  }
  shadow.addEventListener('pointerdown',e=>pointers.add(e.pointerId));
  const endPointer=e=>{if(pointers.delete(e.pointerId))later();};for(const type of ['pointerup','pointercancel','lostpointercapture'])doc.addEventListener(type,endPointer,true);
  shadow.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key))keys.add(e.key);});shadow.addEventListener('keyup',e=>{keys.delete(e.key);later();});
  shadow.addEventListener('compositionstart',()=>{composing=true;});shadow.addEventListener('compositionend',()=>{composing=false;later();});
  const release=()=>{pointers.clear();keys.clear();composing=false;later();};doc.defaultView?.addEventListener('blur',release);
  const unsubscribe=controller.subscribe?.(render);render();
  return Object.freeze({render,root:shadow,destroy(){destroyed=true;unsubscribe?.();if(timer!==null)clearTimeout(timer);for(const type of ['pointerup','pointercancel','lostpointercapture'])doc.removeEventListener(type,endPointer,true);doc.defaultView?.removeEventListener('blur',release);shadow.replaceChildren();}});
}
