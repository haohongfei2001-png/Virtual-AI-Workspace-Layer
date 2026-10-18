import {readActiveLocalStatus} from '../src/host/local-status.mjs';
const messages={ready:'当前标签页的增强界面已连接。',dormant:'增强界面已休眠，原生 ChatGPT 仍可使用。',connecting:'正在连接当前工作空间，原生 ChatGPT 仍可使用。',waiting:'暂时无法验证当前工作空间，正在等待新的上下文证据。原生 ChatGPT 仍可使用。',unavailable:'当前标签页尚未接入增强界面。请确认这是受支持的 ChatGPT 页面；原生页面仍可使用。'};
const state=await readActiveLocalStatus({tabs:chrome.tabs});
document.getElementById('status').textContent=messages[state];
