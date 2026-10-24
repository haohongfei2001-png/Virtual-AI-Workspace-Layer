import './extension/temporary-navigation.mjs';
// User gesture in the existing development popup; preserve its navigation UI.
const shadow=document.body.firstElementChild?.shadowRoot,main=shadow?.querySelector('main');
// The shared navigation reset makes unstyled buttons look like ordinary text.
// Style only this development entry, inside the popup's existing shadow root.
const style=document.createElement('style');style.textContent=`
#source-witness-open{display:block;box-sizing:border-box;width:100%;min-height:44px;margin:12px 0 16px;padding:12px 16px;border:1px solid #2563eb;border-radius:10px;background:#2563eb;color:#fff;font:600 14px/1.4 system-ui;text-align:center;cursor:pointer}
#source-witness-open:hover:not(:disabled){background:#1d4ed8;border-color:#1d4ed8}
#source-witness-open:focus-visible{outline:3px solid var(--focus,#3877ba);outline-offset:3px}
#source-witness-open:disabled{opacity:.65;cursor:wait}
`;shadow?.append(style);
const button=document.createElement('button');button.id='source-witness-open';button.textContent='本机一次性来源验证';main?.insertBefore(button,main.children[1]??null);
button?.addEventListener('click',async event=>{
 if(!event.isTrusted)return;
 button.disabled=true;
 try{const tabs=await chrome.tabs.query({active:true,currentWindow:true}),tab=tabs[0];
 if(tabs.length!==1||!Number.isSafeInteger(tab.id)||tab.incognito||!tab.url?.startsWith('https://chatgpt.com/'))throw Error('target');
 await chrome.tabs.create({url:chrome.runtime.getURL('source-witness.html')+'#'+tab.id});
 }catch{button.textContent='请在已授权 Profile 的 ChatGPT 标签中打开此入口';button.disabled=false;}
});
