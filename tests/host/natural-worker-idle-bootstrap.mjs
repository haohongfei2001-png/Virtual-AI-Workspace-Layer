/** Serialized into the isolated fixture page. Reads only, including during parsing. */
export function readIdleBootstrapFacts() {
 const root=document.documentElement;
 const control=document.querySelector('[aria-label="返回工作空间"]');
 const rect=control?.getBoundingClientRect();
 return {
  url:location.href,readyState:document.readyState,rootPresent:root!==null,
  visibility:document.visibilityState,focused:document.hasFocus(),
  state:root?.dataset.vaiwlState??null,reason:root?.dataset.vaiwlReason??null,
  open:[...document.querySelectorAll('[data-va-owned] iframe')].filter(f=>f.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&f.getBoundingClientRect().width>0&&f.getBoundingClientRect().height>0).length,
  owned:document.querySelectorAll('[data-va-owned]').length,
  frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),
  editorCount:document.querySelectorAll('#prompt-textarea').length,
  readingCount:document.querySelectorAll('#reading').length,
  activeElement:{tag:document.activeElement?.tagName??null,id:document.activeElement?.id??null,owned:!!document.activeElement?.closest?.('[data-va-owned]')},
  returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length,
  returnVisible:!!rect&&rect.width>0&&rect.height>0&&getComputedStyle(control).visibility==='visible',
 };
}

export function idleEvaluationFailure(details) {
 // Keep the original bounded synthetic-page exception, not merely a generic
 // wrapper that makes the failing bootstrap phase impossible to diagnose.
 return new Error('page-evaluation-failed:'+JSON.stringify({
  text:String(details.text??'').slice(0,160),
  exception:String(details.exception?.description??'').slice(0,800),
  line:Number.isSafeInteger(details.lineNumber)?details.lineNumber:null,
  column:Number.isSafeInteger(details.columnNumber)?details.columnNumber:null,
 }));
}

/** Existing idle probe only: observe an OOPIF before its first module runs.
 * The host session's filter excludes workers. Blank iframe targets may commit
 * later, so the script checks the exact extension role URL in the document.
 * Disarm before the idle window; this helper never issues an extension RPC.
 */
export function createIdleFrameBootstrap({command,prefix,roles,installObserver}) {
 if(!/^chrome-extension:\/\/[a-z]+\/$/.test(prefix)||!Array.isArray(roles)||!roles.length||roles.some(role=>!['workspace','sidebar'].includes(role)))throw Error('invalid-idle-frame-scope');
 const source=`(()=>{if(${JSON.stringify(roles.map(role=>prefix+role+'.html'))}.includes(location.href)&&!globalThis.idleObserverInstalled&&globalThis.chrome?.runtime?.sendMessage){(${installObserver.toString()})();globalThis.idleObserverInstalled=true;}})()`;
 let host=null,failure=null,attachments=0,completed=0;
 const frames=new Map(),pending=new Set();
 const check=()=>{if(failure)throw failure;};
 function handle(message){
  if(!host||message.sessionId!==host||message.method!=='Target.attachedToTarget')return;
  const {sessionId,targetInfo}=message.params;
  if(targetInfo.type!=='iframe'){failure??=Error('idle-observer-attached-non-iframe');return;}
  const row={sessionId,targetId:targetInfo.targetId,ready:false,task:null};
  frames.set(row.targetId,row);
  row.task=(async()=>{
   try{
    if(++attachments>8)throw Error('idle-observer-frame-capacity');
    // Chromium activates per-frame document scripts through the Page domain.
    // Registering the script on a disabled domain can acknowledge without
    // executing it before the extension module starts.
    await command('Page.enable',{},sessionId);
    await command('Page.addScriptToEvaluateOnNewDocument',{source,runImmediately:true},sessionId);
    row.ready=true;completed++;
   }catch(error){failure??=error;}
   finally{
    // Always release this iframe, including when instrumentation fails.
    // This path cannot receive a worker through the fixed filter above.
    try{await command('Runtime.runIfWaitingForDebugger',{},sessionId);}catch(error){failure??=error;row.ready=false;}
   }
  })();
  pending.add(row.task);row.task.finally(()=>pending.delete(row.task));
 }
 return {
  handle,
  async arm(sessionId){
   check();if(host)throw Error('idle-observer-already-armed');
   host=sessionId;frames.clear();
   await command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe'},{exclude:true}]},host);
  },
  async frame(targetId){const row=frames.get(targetId);if(!row)return null;await row.task;check();return row.ready?{sessionId:row.sessionId}:null;},
  async stop(){
   if(!host){check();return;}
   // Complete and resume already attached frames before removing auto-attach.
   // Its acknowledgement also detaches every session it created.
   await Promise.all([...pending]);
   try{await command('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true},host);}
   finally{host=null;await Promise.all([...pending]);frames.clear();}
   check();
  },
  snapshot:()=>({armed:host!==null,pending:pending.size,attachments,completed,failed:failure!==null}),
 };
}
