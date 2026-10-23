// Synthetic records for operating the CURRENT packaged Free UI. These are not
// account data or an alternate renderer. Names follow the retained v2.7 sample.
const samples = [
 ['PAIA',['开发 1.0','输入板交互','官网文案','命名规则','同步边界','权限边界']],
 ['硕士论文',['二阶推导','数值核对','论文结构']],
 ['秋招',['岗位比较','面试复盘']],
 ['输入法',['词库与纠错','候选栏交互','个人词汇','兼容测试']],
 ['阅读',['章节讨论','延伸阅读']],
 ['写作',['短篇改稿']],
];
export const approvedWorkspaceProjects = samples.map(([name],i)=>({id:'g-p-'+String(i+1).repeat(32),name}));
export const approvedWorkspaceConversations = samples.flatMap(([,titles],i)=>titles.map((title,j)=>({id:`${String(i+1).repeat(8)}-${String(j+1).padStart(4,'0')}-4000-8000-${String(j+1).padStart(12,'0')}`,title,project:approvedWorkspaceProjects[i].id})));
// Only adapt the EXISTING native reconstruction to its EXISTING simulator skin.
// Product cards, navigation, search, settings and actions come from MV3 frames.
export function approvedWorkspaceHost(html){
 const links=approvedWorkspaceProjects.map(p=>`<a class="nav-link" href="/g/${p.id}/project">${p.name}</a>`).join('');
 return html.replace('ChatGPT — offline reconstruction','VAIWL Free · 本地合成资料')
  .replace('</head>','<link rel="stylesheet" href="/simulator-host.css"></head>')
  .replace('<body>','<body style="font-size:16px"><div class="app" style="height:100dvh;width:100%">')
  .replace('<aside aria-label="Sidebar">','<aside aria-label="Sidebar" class="sidebar" style="width:272px;gap:10px">')
  .replace('<nav aria-label="Main navigation">','<div class="sidebar-head"><span class="brand-mark">ChatGPT</span></div><nav aria-label="Main navigation">')
  .replace('data-testid="create-new-chat-button"','class="nav-link" data-testid="create-new-chat-button"')
  .replace('>New chat</a>','>新聊天</a>').replace('>Search chats</button>',' class="nav-link">搜索聊天</button>')
  .replace('>New project</button>',' class="nav-link">新建项目</button>')
  .replace(/<section aria-label="Projects">[\s\S]*?<\/section>/,`<details><summary class="nav-caption">原生项目</summary><section aria-label="Projects">${links}</section></details>`)
   .replace(/<nav aria-label="Chat history">[\s\S]*?<\/nav>/,`<nav aria-label="Chat history" class="nav-scroll"><h2>最近</h2>${approvedWorkspaceConversations.slice(0,2).map(c=>`<a class="nav-link" href="/c/${c.id}">${c.title}</a>`).join('')}</nav>`)
  .replace('id="account-button"','class="account" id="account-button"').replace('>Account</button>','>本地合成资料 · 无账户连接</button>')
  .replace('<main><header>','<main class="chat-main"><header class="chat-header">')
  .replace('id="model-button"','class="model-button" id="model-button"')
  .replace('id="move-button"','class="tool-button" id="move-button"')
  .replace('>Move to project</button>','>移至项目</button>')
  .replace('id="reading"','class="reading-scroll" id="reading"')
   .replace('id="composer"','class="composer" style="flex:none;margin:12px auto;width:min(740px,90%);border-color:var(--line)" id="composer"')
  .replace('<button type="button" id="tools-button">','<div class="composer-actions"><button type="button" id="tools-button">')
  .replace('<output aria-live="polite"></output></form>','<output aria-live="polite"></output></div></form>')
  .replace('<label for="prompt-textarea">Message ChatGPT</label>','<label for="prompt-textarea" style="font-size:12px;color:var(--muted)">本地输入 · 不发送到 ChatGPT</label>')
  .replace('placeholder="Ask anything"','placeholder="输入内容，体验原生输入与返回"')
  .replace('id="tools-button"','class="tool-button" id="tools-button"')
  .replace('>Tools</button>','>工具</button>').replace('<button type="submit">Send</button>','<button class="tool-button" type="submit">本地发送</button>')
  .replace('<script type="module" src="/native.mjs">','</div><script type="module" src="/native.mjs">');
}
