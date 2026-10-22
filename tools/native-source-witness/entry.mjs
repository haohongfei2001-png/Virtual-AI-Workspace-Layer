import './extension/temporary-navigation.mjs';
// User gesture in the existing development popup; preserve its navigation UI.
const main=document.body.firstElementChild?.shadowRoot?.querySelector('main');
const button=document.createElement('button');button.id='source-witness-open';button.textContent='本机一次性来源验证';main?.insertBefore(button,main.children[1]??null);
button?.addEventListener('click',async event=>{
 if(!event.isTrusted)return;
 button.disabled=true;
 try{const tabs=await chrome.tabs.query({active:true,currentWindow:true}),tab=tabs[0];
 if(tabs.length!==1||!Number.isSafeInteger(tab.id)||tab.incognito||!tab.url?.startsWith('https://chatgpt.com/'))throw Error('target');
 await chrome.tabs.create({url:chrome.runtime.getURL('source-witness.html')+'#'+tab.id});
 }catch{button.textContent='请在已授权 Profile 的 ChatGPT 标签中打开此入口';button.disabled=false;}
});
