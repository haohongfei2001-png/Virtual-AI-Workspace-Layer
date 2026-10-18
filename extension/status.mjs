import {readActiveLocalStatus} from '../src/host/local-status.mjs';
const messages={ready:'本次检查：增强界面已连接。',dormant:'本次检查：增强界面已休眠，原生 ChatGPT 仍可使用。',connecting:'本次检查：正在连接工作空间，原生 ChatGPT 仍可使用。',waiting:'本次检查：暂时无法验证工作空间，正在等待新的上下文证据。原生 ChatGPT 仍可使用。',unavailable:'本次检查：此标签页尚未接入增强界面。请确认这是受支持的 ChatGPT 页面；原生页面仍可使用。'};
const state=await readActiveLocalStatus({tabs:chrome.tabs});
document.getElementById('status').textContent=messages[state];
