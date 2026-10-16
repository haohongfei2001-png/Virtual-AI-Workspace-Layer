/** Terminal read feedback only. Recovery is an explicit user action. */
export function createFreeFrameReadError({document:doc,container,onRetry,onExit}={}){
 if(typeof doc?.createElement!=='function'||typeof container?.append!=='function'||typeof onRetry!=='function'||typeof onExit!=='function')throw Error('invalid-free-frame-read-error');
 let root=null,generation=0,stopped=false;
 const node=(tag,text='')=>{const value=doc.createElement(tag);value.textContent=text;return value;};
 const invoke=callback=>{try{Promise.resolve(callback()).catch(()=>{});}catch{}};
 function clear(){generation++;root?.remove();root=null;}
 function show({retryable=true}={}){
  if(stopped)return;
  if(typeof retryable!=='boolean')throw Error('invalid-free-frame-read-error-retryable');
  clear();const run=generation;
  root=node('section');root.setAttribute('data-vaiwl-read-error','');root.style.cssText='padding:12px;color:var(--ink,#202123);background:var(--surface,#fff);font:inherit';
  const status=node('p','工作空间数据正在更新，本次读取已停止。');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=node('button','重新读取'),exit=node('button','返回原生界面');
  for(const button of [retry,exit]){button.type='button';button.style.cssText='font:inherit;color:inherit;border:1px solid var(--line,#e5e5e5);background:var(--bubble,#f4f4f4);border-radius:8px;padding:6px 10px;margin:0 8px 0 0';}
  retry.disabled=!retryable;let retried=false,exited=false;
  retry.addEventListener('click',event=>{if(event.isTrusted!==true||stopped||run!==generation||!retryable||retried||exited)return;retried=true;retry.disabled=true;invoke(onRetry);});
  exit.addEventListener('click',event=>{if(event.isTrusted!==true||stopped||run!==generation||exited)return;exited=true;retry.disabled=true;exit.disabled=true;invoke(onExit);});
  root.append(status,retry,exit);container.append(root);
 }
 return Object.freeze({show,stop(){if(stopped)return;stopped=true;clear();}});
}
