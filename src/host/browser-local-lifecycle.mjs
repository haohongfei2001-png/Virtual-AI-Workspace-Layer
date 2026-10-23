/** Local privacy boundary. Never infer an account from labels or URLs. Lock
 * before native account controls or leaving the foreground can reveal old data. */
export function installBrowserLocalLifecycle({document:doc,runtime,session,profile}){
 let waiting=false,run=0,stopped=false,locked=Promise.resolve(true);
 const owned=target=>target?.closest?.('[data-va-owned]')||target?.tagName==='IFRAME'&&target.src?.startsWith(runtime.getURL(''));
 const lock=()=>{
  if(stopped)return;waiting=true;run++;session.stop();
  // A failed revocation must not allow focus to reopen the preceding binding.
  locked=Promise.resolve().then(()=>runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'lock'})).then(r=>r?.ok===true,()=>false);
 };
 const blur=()=>{if(!owned(doc.activeElement))lock();};
 const hidden=()=>{if(doc.visibilityState==='hidden')lock();};
 const pointer=e=>{if(!e.isTrusted||owned(e.target))return;const control=e.target.closest?.('button,[role="button"],[role="menuitem"],[role="option"]');if(control)lock();};
 const keyboard=e=>{if(e.key==='Enter'||e.key===' ')pointer(e);};
 const navigation=e=>{
  if(!e.isTrusted||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||owned(e.target))return;
  const link=e.target.closest?.('a[href]');
  if(!link||link.target&&link.target!=='_self'||link.hasAttribute('download'))return;
  if(![profile?.sidebarBoundary,profile?.projectListBoundary].filter(Boolean).some(s=>link.closest(s)))return;
  void runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'prepare-navigation',target:link.href}).catch(()=>{});
 };
 const restart=async()=>{
  if(stopped)return false;const ticket=++run,pending=locked;
  if(!await pending||stopped||ticket!==run||pending!==locked)return false;
  waiting=false;session.stop();await session.start();return !stopped&&ticket===run;
 };
 const focus=()=>{if(waiting&&doc.visibilityState==='visible')void restart();};
 const message=(m,sender,reply)=>{
  if(sender?.id!==runtime.id||sender.tab!==undefined||Object.keys(m??{}).length!==1)return;
  if(m.type==='HOST_LOCAL_RESTART'){
   void restart().then(ok=>reply({ok}),()=>reply({ok:false}));return true;
  }
  if(m.type==='HOST_DOCUMENT_INVALIDATED'&&waiting)void restart();
 };
 doc.defaultView.addEventListener('blur',blur);doc.defaultView.addEventListener('focus',focus);doc.addEventListener('visibilitychange',hidden);doc.addEventListener('pointerdown',pointer,true);doc.addEventListener('keydown',keyboard,true);doc.addEventListener('click',navigation,true);runtime.onMessage.addListener(message);
 return ()=>{stopped=true;run++;session.stop();doc.defaultView.removeEventListener('blur',blur);doc.defaultView.removeEventListener('focus',focus);doc.removeEventListener('visibilitychange',hidden);doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('keydown',keyboard,true);doc.removeEventListener('click',navigation,true);runtime.onMessage.removeListener(message);};
}
