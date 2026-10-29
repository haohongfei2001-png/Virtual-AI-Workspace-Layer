// Application behavior reconstruction; no adapter, expected world, or test seed APIs.
const $ = (s) => document.querySelector(s);
const setSidebar = open => { $('aside').toggleAttribute('data-native-sidebar-open',open);$('#sidebar-toggle')?.setAttribute('aria-expanded',String(open)); };
if($('#sidebar-toggle'))$('#sidebar-toggle').onclick=()=>setSidebar(true);
if($('#sidebar-close'))$('#sidebar-close').onclick=()=>{setSidebar(false);$('#sidebar-toggle').focus();};
document.addEventListener('keydown',event=>{if(event.key==='Escape')setSidebar(false);});
let current = null;
async function action(kind, extra = {}) {
  const response = await fetch('/native/action', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({kind,...extra}) });
  if (!response.ok) throw new Error('Native action failed');
  return response.json();
}
function hasDraft() { return ($('#composer [data-j3-editor=plain]') ?? $('#prompt-textarea')).value.length > 0 || ($('#composer [data-j3-editor=rich]')?.textContent.length ?? 0)>0 || $('#composer input[type=file]').files.length > 0; }
async function navigate(path, {pop = false} = {}) {
  // A native SPA route transition retains the actual editor node and draft.
  const response = await fetch(`/native/route?path=${encodeURIComponent(path)}`);
  if (!response.ok) return;
  const view = await response.json(); current = view;
  if (!pop) history.pushState(null, '', path);
  setSidebar(false);
  $('h1').textContent = view.title;
  const reading = $('#reading'); reading.replaceChildren();
  // Reconstruction's own rendered object association, from the route response.
  // This attribute is not a claim about the live ChatGPT DOM.
  if(view.conversationId)reading.dataset.conversationId=view.conversationId;else delete reading.dataset.conversationId;
  if (view.project) {
    const heading = document.createElement('h2'); heading.textContent = view.project.name; reading.append(heading);
    const members = document.createElement('nav'); members.setAttribute('aria-label','Project conversations'); members.dataset.projectId = view.project.id;
    for (const item of view.conversations) { const a = document.createElement('a'); a.href = item.href; a.textContent = item.title; members.append(a); }
    reading.append(members);
    const create = document.createElement('button'); create.textContent = 'New chat in project';
    create.onclick = async () => { const result = await action('new-project-chat', {projectId:view.project.id}); await navigate(result.href); };
    reading.append(create);
  } else if(Array.isArray(view.messages)){for(const item of view.messages){const article=document.createElement('article');article.dataset.messageId=item.messageId;article.dataset.branchId=item.branchId;const body=document.createElement('div');body.className='message-body';body.textContent=item.text;article.append(body);reading.append(article);}} else { const p = document.createElement('p'); p.textContent = view.text; reading.append(p); }
  $('#move-button').disabled = !view.conversationId;
}
document.addEventListener('click', async (event) => {
  const a = event.target.closest('a[href]');
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(a.href); if (url.origin !== location.origin) return;
  event.preventDefault(); await action(a.dataset.testid === 'create-new-chat-button' ? 'new-chat' : 'navigate', {path:url.pathname}); await navigate(url.pathname);
});
$('.project-entry').onclick = async () => { const result = await action('open-project-button'); await navigate(result.href); };
$('#search-button').onclick = async () => { await action('search'); $('#search-dialog').showModal(); };
$('#search-dialog input').oninput = async (event) => {
  const response = await fetch(`/backend-api/conversations?query=${encodeURIComponent(event.target.value)}`);
  const data = await response.json(); const results = $('#search-dialog .results'); results.replaceChildren();
  for (const item of data.items) { const a = document.createElement('a'); a.href = `/c/${item.id}`; a.textContent = item.title; a.onclick = () => $('#search-dialog').close(); results.append(a); }
};
$('#new-project').onclick = async () => { await action('new-project'); $('#project-dialog').showModal(); };
$('#project-dialog').addEventListener('close', async () => { if ($('#project-dialog').returnValue !== 'create') return; const result = await action('create-project', {name:$('#project-dialog input').value}); await navigate(result.href); });
$('#move-button').onclick = async () => {
  const response = await fetch(`/native/move-menu?conversation=${encodeURIComponent(current.conversationId)}`);
  const data = await response.json(); $('#move-dialog').dataset.conversationId = data.conversationId; const options = $('#move-dialog .options'); options.replaceChildren();
  for (const item of data.items) { const label = document.createElement('label'); const input = document.createElement('input'); input.type='radio'; input.name='project'; input.checked=item.selected; label.append(input, document.createTextNode(item.label)); options.append(label); }
  $('#move-dialog').showModal();
};
for (const id of ['model','tools','account']) $(`#${id}-button`).onclick = async () => { await action(id); if(id==='tools'&&$('#permission-dialog')){$('#permission-dialog').showModal();return;} $('#native-dialog p').textContent = `${id} options`; $('#native-dialog').showModal(); };
$('#composer').onsubmit = async (event) => { event.preventDefault(); if(event.isComposing) return; await action('send-intent'); $('#composer output').textContent = 'Offline reconstruction: message not sent'; };
addEventListener('beforeunload', (event) => { if(hasDraft()) { event.preventDefault(); event.returnValue=''; } });
addEventListener('popstate', () => navigate(location.pathname, {pop:true}));
await navigate(location.pathname, {pop:true});

// Optional J3 application-owned surfaces. No extension API or synthetic ACK.
if($('#editor-mode')){
 $('#editor-mode').onclick=async()=>{await action('editor-mode');const plain=$('#composer [data-j3-editor=plain]'),rich=$('#composer [data-j3-editor=rich]'),toRich=rich.hidden;plain.id=toRich?'j3-textarea':'prompt-textarea';rich.id=toRich?'prompt-textarea':'j3-contenteditable';plain.hidden=toRich;rich.hidden=!toRich;$('#editor-mode').textContent=toRich?'Use textarea':'Use contenteditable';(toRich?rich:plain).focus();};
 for(const choice of ['allow','deny'])$('#permission-'+choice).onclick=async()=>{await action('permission-'+choice);$('#permission-result').textContent=choice==='allow'?'Fixture permission allowed':'Fixture permission denied';$('#permission-dialog').close(choice);};
}
