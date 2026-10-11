import { env } from './environment.mjs';
import { dataset, messagesFor, routeInfo, FIXTURE_NOW, VARIANTS } from './data.mjs';
const paths={sidebar:'M3 4h18v16H3z M9 4v16',new:'M4 18v3h3L19 9l-3-3L4 18 M14 8l3 3',search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',folder:'M3 6h7l2 3h9v11H3z',plus:'M12 5v14 M5 12h14',up:'M12 19V5 M6 11l6-6 6 6',down:'M6 9l6 6 6-6',more:'M5 12h.01 M12 12h.01 M19 12h.01',share:'M12 15V3 M7 8l5-5 5 5 M5 13v8h14v-8',file:'M5 3h9l5 5v13H5z M14 3v6h5',tools:'M4 7h16 M8 4v6 M4 17h16 M16 14v6',audio:'M5 9v6 M9 5v14 M13 8v8 M17 3v18 M21 10v4',pin:'M9 3h6l-1 6 4 4v2H6v-2l4-4z M12 15v6'};
export const icon = name => `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${paths[name]??paths.more}"/></svg></span>`;
export function el(tag, attrs={}, text='') { const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n; }
function button(label, onClick, symbol, cls='icon-button'){const b=el('button',{type:'button','aria-label':label,title:label,class:cls});if(symbol)b.innerHTML=icon(symbol);else b.textContent=label;b.addEventListener('click',onClick);return b;}
export function createHost() {
  const parsed=routeInfo(env.location.href);
  if(!parsed)throw Error('synthetic-route-required');
  const state={account:parsed.account,variant:'baseline',size:new URL(env.location.href).searchParams.get('size')==='120'?120:8,timeZone:'Asia/Shanghai',now:FIXTURE_NOW,delay:0,failNext:false,
    routeVersion:0,navVersion:0,streamTicks:0,errors:[],stale:0,theme:'light',pending:false};
  const views=new Map(), custom=new Map(); let currentView=null, controlWindow=opener;
  const ribbon=el('div',{class:'test-ribbon'},'VAIWL TEST HOST · 全部内容均为合成');
  const control=el('a',{href:'/control.html',target:'vaiwl-hf-control'},'测试控制台');
  control.onclick=e=>{e.preventDefault();controlWindow=window.open('/control.html','vaiwl-hf-control','width=600,height=820');};ribbon.append(control);
  const app=el('div',{class:'app'}), sidebar=el('aside',{class:'sidebar','aria-label':'Sidebar','data-collapsed':String(innerWidth<700)});
  const main=el('main',{class:'chat-main'}), header=el('header',{class:'chat-header','aria-label':'Chat actions'});
  const model=button('模型菜单',()=>menu(model,['模拟模型 · Standard','模拟模型 · Reasoning'],x=>model.firstChild.textContent=x.includes('Reasoning')?'ChatGPT Reasoning ':'ChatGPT '),null,'model-button');
  model.replaceChildren(document.createTextNode('ChatGPT '));model.insertAdjacentHTML('beforeend',icon('down'));
  const crumb=el('span',{class:'project-crumb'}), space=el('span',{class:'header-space'});
  const share=button('分享',()=>dialog('分享合成对话',d=>{d.append(el('p',{},'此操作只改变本机合成状态，不创建公网分享链接。'));const p=el('p',{'data-share-result':''});d.append(p);actions(d,[['取消',()=>d.close()],['创建测试链接',()=>{p.textContent='已创建仅本机可见的合成分享';state.shared=true;}]])}), 'share','share-button');share.append(el('span',{},'分享'));
  const more=button('会话菜单',()=>menu(more,['归档合成聊天','固定合成聊天'],x=>{if(currentView){if(x.startsWith('归档'))currentView.archived=true;else currentView.pinned=!currentView.pinned;renderSidebar();}}),'more');
  header.append(model,crumb,space,share,more);
  const reading=el('section',{class:'reading-scroll','aria-label':'Conversation'}), composerWrap=el('footer',{class:'composer-wrap','aria-label':'Message composer'});
  main.append(header,reading,composerWrap);app.append(sidebar,main);document.body.replaceChildren(ribbon,app);
  const signal=()=>{document.documentElement.dataset.hfSize=String(state.size);document.documentElement.dataset.hfNow=state.now;document.documentElement.dataset.hfTimeZone=state.timeZone;document.dispatchEvent(new CustomEvent('hf:change',{detail:{version:state.routeVersion}}));};
  const getData=()=>{const data=dataset(state.account,env.location.origin,state.size);
    for(const ref of data.refs){const view=views.get(state.account+':'+ref.id);if(view){if(typeof view.archived==='boolean')ref.archived=view.archived;if(typeof view.pinned==='boolean')ref.pinned=view.pinned;}}return data;};
  const url=(kind,id,account=state.account)=>'/hf/'+account+'/'+kind+(id?'/'+id:'')+env.location.search;
  function link(label,kind,id,symbol){const a=el('a',{class:'nav-link',href:env.location.origin+url(kind,id)});if(symbol)a.innerHTML=icon(symbol);a.append(el('span',{},label));if(env.location.pathname===new URL(a.href).pathname)a.setAttribute('aria-current','page');return a;}
  function renderSidebar() {
    const head=el('div',{class:'sidebar-head'}), brand=el('span',{class:'brand-mark'},'◎');
    head.append(brand,button('切换原生侧栏',()=>{sidebar.dataset.collapsed=String(sidebar.dataset.collapsed!=='true');signal();},'sidebar'));
    const scroll=el('div',{class:'nav-scroll'});
    scroll.append(link('新聊天','new',null,'new'),button('搜索聊天',openSearch,'search','nav-link'));
    scroll.lastChild.append(el('span',{},'搜索聊天'));
    const resource=button('文件库',()=>dialog('文件库',d=>{d.append(el('p',{},'合成文件：观察摘要.txt'));actions(d,[['预览',()=>{d.close();preview('观察摘要.txt','这是一份由测试平台创建的合成文件。')}],['关闭',()=>d.close()]])}),'file','nav-link');resource.append(el('span',{},'文件库'));scroll.append(resource);
    if(state.pending){const pending=button('待批准操作',permission,'tools','nav-link');pending.append(el('span',{},'待批准操作'),el('i',{class:'pending-dot'}));scroll.append(pending);}
    if(state.variant==='packed-header'||state.variant==='portal-collision'){const unknown=button('未来原生功能',()=>{state.unknownClicks=(state.unknownClicks||0)+1;dialog('未来原生功能',d=>{d.append(el('p',{},'扩展不认识此入口，但原生功能仍然可用。'));actions(d,[['关闭',()=>d.close()]])})},'plus','nav-link');unknown.append(el('span',{},'未来原生功能'));scroll.append(unknown);}
    scroll.append(el('h3',{class:'nav-caption'},'项目'));
    for(const p of getData().projects)scroll.append(link(p.name+(p.pinned?' · 固定':''),'project',p.id,'folder'));
    scroll.append(el('h3',{class:'nav-caption'},'固定'));
    for(const r of getData().refs.filter(r=>r.pinned))scroll.append(link(r.nativeTitle,'c',r.id,'pin'));
    const historyNav=el('nav',{'aria-label':state.variant==='no-safe-boundary'?'Mixed native resources':'Chat history'});
    historyNav.append(el('h3',{class:'nav-caption'},'聊天'));
    for(const r of getData().refs.filter(r=>!r.archived).slice(0,25))historyNav.append(link(r.nativeTitle,'c',r.id));
    for(const r of custom.values())if(r.scope===state.account)historyNav.append(link(r.nativeTitle,'c',r.id));
    if(state.variant==='nested-sidebar'){const wrap=el('section'),inner=el('div');inner.append(historyNav);wrap.append(inner);scroll.append(wrap);}else scroll.append(historyNav);
    const account=button('账户与设置',()=>dialog('合成账户与设置',d=>{
      d.append(el('p',{},'这里没有登录、密码或任何真实账户。'));
      for(const a of ['A','B','unknown']){const b=button('切换账户 '+a,()=>{d.close();navigate(url('c','T0',a));});d.append(b);}
      actions(d,[['浅色 / 深色',()=>{state.theme=state.theme==='light'?'dark':'light';document.documentElement.dataset.theme=state.theme;signal();}],['关闭',()=>d.close()]]);
    }),null,'account');account.replaceChildren(el('span',{class:'avatar'},state.account==='unknown'?'?':state.account));const name=el('span',{class:'account-name'},'Synthetic '+state.account);name.append(el('small',{},'测试身份 · 无真实账户'));account.append(name);
    sidebar.replaceChildren(head,scroll,account);state.navVersion++;signal();
  }
  function actions(d,items){const row=el('div',{class:'dialog-actions'});for(const [label,fn]of items)row.append(button(label,fn));d.append(row);}
  function dialog(title,build){const prior=document.activeElement,d=el('dialog',{'aria-label':title});d.append(el('h2',{},title));build(d);document.body.append(d);d.addEventListener('close',()=>{d.remove();if(prior?.isConnected)prior.focus();signal();},{once:true});d.showModal();signal();return d;}
  function menu(anchor,items,onSelect){const m=el('div',{class:'native-menu',role:'menu',popover:'auto'});for(const text of items)m.append(button(text,()=>{onSelect(text);m.hidePopover();},null));document.body.append(m);const b=anchor.getBoundingClientRect();m.style.left=Math.min(b.left,innerWidth-220)+'px';m.style.top=Math.min(b.bottom+5,innerHeight-210)+'px';m.addEventListener('toggle',e=>{signal();if(e.newState==='closed'){m.remove();if(anchor.isConnected)anchor.focus();} });m.showPopover();signal();return m;}
  function permission(){return dialog('确认权限',d=>{d.append(el('p',{},'允许合成工具读取本机合成资料？不会访问网络。'));actions(d,[['拒绝',()=>{state.permission='denied';d.close();}],['允许本次',()=>{state.permission='allowed';d.close();}]])});}
  function preview(name,text){dialog('文件预览',d=>{d.append(el('h3',{},name),el('pre',{},text.slice(0,4000)));actions(d,[['关闭',()=>d.close()]])});}
  function openSearch(){dialog('搜索聊天',d=>{const input=el('input',{'aria-label':'原生搜索输入',placeholder:'搜索全部合成聊天，包括已归档项'}), results=el('div',{class:'search-results'});const update=()=>{const q=input.value;results.replaceChildren();for(const r of getData().refs.filter(r=>(r.nativeTitle+r.id).includes(q)).slice(0,80))results.append(link(r.nativeTitle+(r.archived?' · 已归档':''),'c',r.id));};input.oninput=update;d.append(input,results);update();results.addEventListener('click',()=>d.close());actions(d,[['关闭',()=>d.close()]]);queueMicrotask(()=>input.focus());});}
  function messageNode(msg,view){const article=el('article',{class:'message '+msg.role,'data-message-id':msg.id,'data-branch-id':msg.branch});const body=el('div',{class:'message-body'},msg.text);article.append(body);const row=el('div',{class:'message-actions'});
    if(msg.role==='user')row.append(button('编辑消息',()=>dialog('编辑合成消息',d=>{const input=el('textarea',{'aria-label':'编辑内容'},msg.text);d.append(input);actions(d,[['取消',()=>d.close()],['保存编辑',()=>{msg.text=input.value;msg.revision++;body.textContent=msg.text;state.lastMutation='edit-not-send';d.close();}]])})));
    else {row.append(button('重新生成',()=>generate(view)),button('分支对话',()=>{const id='branch-'+(++state.routeVersion);custom.set(id,{...view.ref,id,scope:state.account,nativeTitle:'合成分支',nativeUrl:env.location.origin+url('c',id)});navigate(url('c',id));}));}
    article.append(row);return article;}
  function makeView(ref){const transcript=el('div',{class:'transcript'}), messages=messagesFor(ref,ref.id==='T1');const view={ref,transcript,messages,stream:null,model:'Standard',draft:'',attachments:[]};
    transcript.replaceChildren(...messages.map(m=>messageNode(m,view)));
    const widget=el('section',{class:'interactive-answer','aria-label':'交互式回答'});widget.append(el('label',{},'比较两种方法 · 合成可交互回复'));const value=el('output',{'aria-label':'交互值'},'50'),range=el('input',{type:'range',min:'0',max:'100',value:'50','aria-label':'调整交互值'});range.oninput=()=>value.textContent=range.value;widget.append(value,range);transcript.append(widget);
    const form=el('form',{class:'composer'}),files=el('div',{class:'attachments'}),input=el('textarea',{'aria-label':'消息输入',placeholder:'向 ChatGPT 提问',rows:'1'}),row=el('div',{class:'composer-actions'}),file=el('input',{type:'file','aria-label':'选择附件',hidden:''});
    const add=button('添加附件',()=>file.click(),'plus');const tools=button('工具',()=>menu(tools,['搜索网页（模拟）','研究资料（模拟）','需要权限的工具'],x=>{view.tool=x;if(x.includes('权限'))permission();else state.lastTool=x;}),'tools','tool-button');tools.append(el('span',{},'工具'));
    const send=button('发送消息',()=>sendMessage(view),'up','send'),stop=button('停止生成',()=>stopStream(view),null);stop.hidden=true;stop.textContent='■';stop.className='send';
    row.append(add,tools,el('span',{class:'push'}),button('语音说明',()=>dialog('语音测试边界',d=>{d.append(el('p',{},'没有麦克风采集。真实语音与物理输入法需要独立验收。'));actions(d,[['关闭',()=>d.close()]])}),'audio'),send,stop);
    file.onchange=()=>{for(const f of file.files){const chip=button(f.name,async()=>preview(f.name,await f.text()),null,'file-chip');files.append(chip);view.attachments.push(f.name);}signal();};
    input.oninput=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,220)+'px';view.draft=input.value;signal();};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage(view);}};
    form.onsubmit=e=>{e.preventDefault();sendMessage(view);};form.append(files,input,row,file);view.form=form;view.input=input;view.send=send;view.stop=stop;return view;
  }
  function stopStream(view){if(view.stream)clearInterval(view.stream);view.stream=null;view.stop.hidden=true;view.send.hidden=false;view.output?.classList.remove('streaming');signal();}
  function generate(view){if(!view)return;stopStream(view);const m={id:'reply-'+Date.now(),role:'assistant',text:'',revision:0},node=messageNode(m,view);view.transcript.append(node);const out=node.querySelector('.message-body');view.output=out;out.classList.add('streaming');view.messages.push(m);view.send.hidden=true;view.stop.hidden=false;
    const words='这是一段本机模拟的流式回答，用来验证增量渲染、停止按钮以及主题切换期间的组件状态。它不会请求任何模型或外部服务。'.repeat(8);let i=0;view.stream=setInterval(()=>{m.text+=words.slice(i,i+3);i+=3;out.textContent=m.text;state.streamTicks++;if(i>=words.length)stopStream(view);},45);signal();
  }
  function sendMessage(view){if(!view||!view.input.value.trim()||view.stream)return;const msg={id:'sent-'+Date.now(),role:'user',text:view.input.value,revision:0};view.messages.push(msg);view.transcript.append(messageNode(msg,view));view.input.value='';view.draft='';view.input.style.height='28px';state.lastMutation='new-send';generate(view);}
  async function renderRoute(){const ticket=++state.routeVersion,info=routeInfo(env.location.href);if(!info)return;state.account=info.account;renderSidebar();if(state.delay)await new Promise(r=>setTimeout(r,state.delay));if(ticket!==state.routeVersion){state.stale++;return;}
    if(state.failNext){state.failNext=false;reading.replaceChildren(el('div',{class:'denied'},'合成请求失败'));reading.firstChild.append(button('重试加载',renderRoute));composerWrap.replaceChildren();signal();return;}
    const data=getData();crumb.textContent='';if(state.account==='unknown'){reading.replaceChildren(el('div',{class:'denied'},'账户身份尚未确认'));composerWrap.replaceChildren();currentView=null;signal();return;}
    if(info.kind==='project'){const section=el('div',{class:'transcript project-view'}),p=data.projects.find(p=>p.id===info.id);section.append(el('h1',{},p?.name??'未知项目'),el('div',{class:'native-notice'},'项目的文件、指令和权限属于此原生合成项目。派生主题不会合并它们。'));
      const files=el('div',{class:'project-files'});files.append(button('项目文件',()=>preview('项目资料.txt','仅属于 '+info.id),null,'file-chip'),button('项目指令',()=>dialog('项目指令',d=>{d.append(el('p',{},'仅用于 '+info.id+' 的合成指令。'));actions(d,[['关闭',()=>d.close()]])}),null,'file-chip'));section.append(files);for(const r of data.refs.filter(r=>r.projectId===info.id))section.append(link(r.nativeTitle,'c',r.id));reading.replaceChildren(section);composerWrap.replaceChildren();currentView=null;signal();return;}
    let ref=data.refs.find(r=>r.id===info.id)??custom.get(info.id);if(info.kind==='new'){const id='new-'+state.routeVersion;ref={scope:state.account,id,nativeTitle:'新聊天',available:true,projectId:null};custom.set(id,ref);}
    if(!ref||ref.available===false){reading.replaceChildren(el('div',{class:'denied'},'此合成对象不可访问，原生权限仍然生效。'));composerWrap.replaceChildren();currentView=null;signal();return;}
    const key=state.account+':'+ref.id;if(!views.has(key))views.set(key,makeView(ref));currentView=views.get(key);
    if(info.kind==='new'){currentView.transcript.replaceChildren(el('div',{class:'welcome'},'有什么可以帮忙的？'));currentView.messages=[];}
    crumb.textContent=ref.projectId?data.projects.find(p=>p.id===ref.projectId)?.name:'';reading.replaceChildren(currentView.transcript);composerWrap.replaceChildren(currentView.form,el('div',{class:'disclaimer'},'ChatGPT 高仿真测试宿主 · 非 OpenAI 服务 · 不连接任何模型'));signal();
  }
  function navigate(path){const u=new URL(path,env.location.href);if(u.origin!==env.location.origin||!routeInfo(u.href))return;env.history.pushState({native:true,sequence:state.routeVersion},'',u);signal();void renderRoute();}
  document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(!a||a.target||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;const u=new URL(a.href);if(u.origin===env.location.origin&&routeInfo(u.href)){e.preventDefault();navigate(u.href);}});
  addEventListener('popstate',()=>{signal();void renderRoute();});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch();}});
  function controlState(action,value){
    if(action==='variant'&&VARIANTS.includes(value)){state.variant=value;if(value==='stress')state.size=120;if(value==='narrow')sidebar.dataset.collapsed='true';main.classList.toggle('packed',value==='packed-header');header.querySelector('.header-extra')?.remove();if(value==='packed-header')header.insertBefore(el('div',{class:'header-extra'},'运行中 · 审批 · 文件 · 新功能 · 协作'),space);document.documentElement.dataset.theme=value==='dark'?'dark':state.theme;renderSidebar();}
    else if(action==='account'&&['A','B','unknown'].includes(value))navigate(url('c','T0',value));
    else if(action==='delay')state.delay=Math.max(0,Math.min(3000,Number(value)||0));
    else if(action==='fail')state.failNext=true;
    else if(action==='rebuild-nav')renderSidebar();
    else if(action==='rebuild-main'){const old=reading.firstChild;if(currentView){views.delete(state.account+':'+currentView.ref.id);void renderRoute();}else old?.remove();}
    else if(action==='stress'){state.size=value?120:8;renderSidebar();}
    else if(action==='timeZone'){try{new Intl.DateTimeFormat('en',{timeZone:value});state.timeZone=value;}catch{}}
    else if(action==='now'&&Number.isFinite(Date.parse(value)))state.now=value;
    else if(action==='pending'){state.pending=!!value;renderSidebar();}
    else if(action==='portal')permission();
    else if(action==='stream')generate(currentView);
    else if(action==='grow'&&currentView){currentView.input.value='合成长输入框\n'.repeat(12);currentView.input.dispatchEvent(new Event('input',{bubbles:true}));}
    signal();
  }
  addEventListener('message',e=>{if(e.origin===env.location.origin&&e.source===controlWindow&&e.data?.type==='HF_CONTROL')controlState(e.data.action,e.data.value);});
  void renderRoute();
  return Object.freeze({state,navigate,control:controlState,data:getData,getView:()=>currentView,getNodes:()=>({sidebar,header,reading,composerWrap}),
    destroy:()=>{for(const v of views.values())stopStream(v);}});
}
