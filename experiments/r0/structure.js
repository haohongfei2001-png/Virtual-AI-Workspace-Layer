() => {
  // Aggregate visible structure only. No body text, titles, account labels, URL IDs,
  // input values, cookies, storage, hydration state, network or internal endpoint.
  const official=location.protocol==='https:'&&location.hostname==='chatgpt.com';
  if(!official)return {schema:'r0-structure-v1',official:false,route:'OTHER',scope:'UNVERIFIED',derivedEnabled:false};
  const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return !!(r.width&&r.height)&&s.visibility!=='hidden'&&s.display!=='none';};
  const nodes=selector=>Array.from(document.querySelectorAll(selector)).slice(0,500).filter(visible);
  const buttons=nodes('button,[role="button"],a[href]');
  const has=pattern=>buttons.some(n=>pattern.test(n.getAttribute('aria-label')||n.getAttribute('data-testid')||n.textContent?.trim()||''));
  const refs=nodes('nav a[href],aside a[href]');let chat=0,project=0;
  for(const n of refs){try{const u=new URL(n.getAttribute('href'),location.origin);if(u.origin!==location.origin)continue;if(/^\/c\//.test(u.pathname))chat++;if(/^\/g\/.*project/.test(u.pathname)||/^\/project\//.test(u.pathname))project++;}catch{}}
  const roles={user:0,assistant:0,other:0};const messages=nodes('[data-message-author-role],[data-message-role]');let userTimeNodes=0,userTimeAttributes=0;
  for(const n of messages){const role=n.getAttribute('data-message-author-role')??n.getAttribute('data-message-role');roles[role==='user'||role==='assistant'?role:'other']++;if(role==='user'){userTimeNodes+=n.querySelectorAll('time[datetime]').length;userTimeAttributes+=n.getAttributeNames().filter(k=>/^(data-.*(?:timestamp|created-at|sent-at)|datetime)$/.test(k)).length;}}
  return {schema:'r0-structure-v1',official:true,route:location.pathname==='/'?'HOME':/^\/c\//.test(location.pathname)?'CONVERSATION':/^\/g\//.test(location.pathname)?'GPT_OR_PROJECT':'OTHER',scope:'UNVERIFIED',derivedEnabled:false,
    guestSignals:{login:has(/^(Log in|Login|登录|登入|login-button)$/i),signup:has(/^(Sign up|免费注册|注册|signup-button)$/i)},
    native:{main:nodes('main').length,sidebar:nodes('aside,nav[aria-label]').length,composer:nodes('#prompt-textarea,textarea[placeholder],[contenteditable="true"][role="textbox"]').length,model:has(/^ChatGPT$|model.switcher|model.selector|模型选择|模型菜单/i),tools:has(/composer.plus|tools|工具|添加文件等/i),send:has(/send.button|send.prompt|发送消息|send message/i),stop:has(/stop.button|stop generating|停止生成/i),search:has(/^(Search chats|搜索聊天|搜尋聊天)$/i),newChat:has(/^(New chat|新聊天|新对话|新對話)$/i)},
    visibleReferenceCounts:{chat,project,examined:refs.length,fullAccountCoverage:false},messageRoleMarkers:roles,roleAttributeFamilies:{legacy:messages.filter(n=>n.hasAttribute('data-message-author-role')).length,octane:messages.filter(n=>n.hasAttribute('data-message-role')).length},
    userTimeStructure:{timeNodes:userTimeNodes,timeAttributes:userTimeAttributes,originalSendSemantics:'NOT_ESTABLISHED',coverage:'UNKNOWN'},
    identityAttributeCandidates:document.querySelectorAll('[data-account-id],[data-user-id],[data-organization-id]').length,
    uniqueReturnSlot:'NOT_VERIFIED',nativeDomWritten:false,limitedToCurrentVisibleDocument:true};
}
