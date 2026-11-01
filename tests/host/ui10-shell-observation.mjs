import assert from 'node:assert/strict';

/** Serialized into the parent. Only a temporary listener and JS references;
 * no DOM/style changes, timers, native reads, or surface-control operations. */
export function createUi10OuterObservation(frame){
 const doc=frame.ownerDocument,win=doc.defaultView,surface=frame.parentElement,close=frame.previousElementSibling;
 const backend=surface?.hasAttribute('popover')?'manual':'document-flow';
 const exit=backend==='manual'?surface:doc.getElementById(close?.getAttribute('popovertarget'));
 const owner=surface?.getAttribute('data-va-owned'),window=frame.contentWindow,source=frame.getAttribute('src');
 if(!owner||frame.tagName!=='IFRAME'||close?.tagName!=='BUTTON'||!exit?.hasAttribute('popover')||exit.getAttribute('data-va-owned')!==owner)throw Error('ui10-shell-parent-shape');
 const events=[];let sequence=0,dropped=0,closed=false;
 const toggle=event=>{if(event.target!==exit||event.isTrusted!==true)return;const row={sequence:++sequence,at:win.performance.timeOrigin+win.performance.now(),oldState:event.oldState,newState:event.newState};if(events.length<16)events.push(row);else dropped++;};
 const rect=node=>node?.getBoundingClientRect().toJSON()??null;
 const style=node=>{if(!node)return null;const value=win.getComputedStyle(node);return {display:value.display,visibility:value.visibility};};
 const read=()=>{
  const currentSurface=frame.parentElement,currentClose=frame.previousElementSibling,currentExit=currentSurface?.hasAttribute('popover')?currentSurface:doc.getElementById(currentClose?.getAttribute('popovertarget'));
  const r=close.getBoundingClientRect();
  return {at:win.performance.timeOrigin+win.performance.now(),timeOrigin:win.performance.timeOrigin,viewport:{width:win.innerWidth,height:win.innerHeight},backend,
   identity:{document:win.document===doc,frame:frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window&&frame.getAttribute('src')===source,surface:surface.isConnected&&currentSurface===surface&&surface.getAttribute('data-va-owned')===owner&&surface.hasAttribute('popover')===(backend==='manual'),close:close.isConnected&&currentClose===close,exit:exit.isConnected&&currentExit===exit&&exit.hasAttribute('popover')&&exit.getAttribute('data-va-owned')===owner},
   frame:rect(frame),surface:rect(surface),close:r.toJSON(),closeHit:doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===close,
   exitOpen:exit.matches(':popover-open'),styles:{frame:style(frame),surface:style(surface)},sequence,dropped,events:events.map(row=>({...row}))};
 };
 exit.addEventListener('beforetoggle',toggle,true);
 try{return {before:read(),read,close(){if(!closed){closed=true;exit.removeEventListener('beforetoggle',toggle,true);}return true;}};}
 catch(error){exit.removeEventListener('beforetoggle',toggle,true);throw error;}
}

/** One child task reads the original shell/control geometry. References point
 * into the actual open shadow root; a missing renderer is never a stable null
 * identity that can pass. No private text, attributes, or DTOs are collected. */
export function createUi10ChildObservation(){
 const doc=document,root=doc.documentElement,body=doc.body,main=doc.querySelector('main'),role=body?.dataset.frameRole;
 const locate=()=>{
  const hosts=[...(doc.querySelector('main')?.querySelectorAll('[data-vaiwl-frame-role]')??[])].filter(node=>node.getAttribute('data-vaiwl-frame-role')===role);
  const host=hosts.length===1?hosts[0]:null,shadow=host?.shadowRoot??null,renderer=shadow?.querySelector(role==='workspace'?'.workspace':'section')??null;
  return {hosts,host,shadow,renderer};
 };
 const {hosts,host,shadow,renderer}=locate(),box=main?.getBoundingClientRect(),controls=[];
 // Keep exactly the pre-existing shell control set. This change binds its
 // measurement to the shell task; it does not broaden the visual oracle.
 const allControls=doc.querySelectorAll('button,a,input,select,textarea,[tabindex]');
 for(const node of [...allControls].slice(0,512)){const r=node.getBoundingClientRect(),s=getComputedStyle(node);controls.push({rect:r.toJSON(),visible:s.visibility==='visible'&&s.display!=='none'});}
 const sample={at:performance.timeOrigin+performance.now(),timeOrigin:performance.timeOrigin,role,visibility:doc.visibilityState,
  presence:{main:!!main,root:hosts.length===1,shadow:!!shadow,renderer:!!renderer},
  measurement:{width:innerWidth,height:innerHeight,document:{scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight},main:{y:box?.y??0,height:box?.height??0},scrollX,scrollY},controls,controlsDropped:Math.max(0,allControls.length-controls.length)};
 return {sample,current(){
  const next=locate();
  return {at:performance.timeOrigin+performance.now(),timeOrigin:performance.timeOrigin,
   identity:{document:document===doc&&doc.documentElement===root&&doc.body===body&&doc.body?.dataset.frameRole===role,main:doc.querySelector('main')===main&&(!main||main.isConnected),root:next.hosts.length===hosts.length&&next.host===host&&(!host||host.isConnected),shadow:next.shadow===shadow,renderer:next.renderer===renderer&&(!renderer||renderer.isConnected)}};
 }};
}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const geometry=sample=>({backend:sample.backend,timeOrigin:sample.timeOrigin,viewport:sample.viewport,frame:sample.frame,surface:sample.surface,close:sample.close,exitOpen:sample.exitOpen,styles:sample.styles});

/** Only observable identity, parent geometry, or genuine owned toggle changes
 * make a sample inconsistent. A zero/overflowing child rectangle never does. */
export function ui10ShellInconsistency(attempt){
 const {before,after,final,child,current}=attempt;
 assert(before&&after&&final&&child&&current,'ui10-shell-incomplete-observation');
 for(const sample of [before,after,final])assert(['document','frame','surface','close','exit'].every(key=>typeof sample.identity?.[key]==='boolean')&&Number.isSafeInteger(sample.sequence)&&sample.sequence>=0,'ui10-shell-invalid-parent-observation');
 assert(['document','main','root','shadow','renderer'].every(key=>typeof current.identity?.[key]==='boolean')&&['main','root','shadow','renderer'].every(key=>typeof child.presence?.[key]==='boolean'),'ui10-shell-invalid-child-observation');
 if([before,after,final].some(sample=>sample.dropped!==0)||child.controlsDropped!==0)throw Error('ui10-shell-observation-dropped');
 const reasons=[];
 if([before,after,final].some(sample=>Object.values(sample.identity).some(value=>value!==true)))reasons.push('parent-identity-changed');
 if(!same(geometry(before),geometry(after))||!same(geometry(before),geometry(final)))reasons.push('parent-geometry-changed');
 if(before.sequence!==after.sequence||before.sequence!==final.sequence)reasons.push('owned-beforetoggle-changed');
 if(Object.values(current.identity).some(value=>value!==true)||child.timeOrigin!==current.timeOrigin)reasons.push('child-identity-changed');
 return reasons;
}

/** The parent listener remains active across child identity validation. Late
 * handles are cleaned even if the shared observation deadline already expired. */
async function captureAttempt(frame,run,cleanup,record){
 const handles=[];
 const own=async(work,kind)=>{
  const release=async handle=>{try{if(kind==='outer')await handle.evaluate(value=>value.close());}finally{await handle.dispose();}};
  const handle=await run(work,release);handles.push({handle,kind});return handle;
 };
 const result={};record.sample=result;
 try{
  const element=await own(()=>frame.frameElement(),'element');
  const outer=await own(()=>element.evaluateHandle(createUi10OuterObservation),'outer');
  result.before=await run(()=>outer.evaluate(value=>value.before));
  const child=await own(()=>frame.evaluateHandle(createUi10ChildObservation),'child');
  result.child=await run(()=>child.evaluate(value=>value.sample));
  result.after=await run(()=>outer.evaluate(value=>value.read()));
  result.current=await run(()=>child.evaluate(value=>value.current()));
  result.final=await run(()=>outer.evaluate(value=>value.read()));
  return result;
 }catch(error){error.ui10ShellPartial=result;throw error;}
 finally{
  // Removing a listener is cleanup, never another geometry observation or a
  // new six-second opportunity. Cleanup failure makes the whole check fail.
  const failures=[];
  for(const {handle,kind}of handles.reverse()){
   if(kind==='outer')try{await cleanup(()=>handle.evaluate(value=>value.close()));}catch(error){failures.push(error.message);}
   try{await cleanup(()=>handle.dispose());}catch(error){failures.push(error.message);}
  }
  if(failures.length){const error=Error('ui10-shell-cleanup-failed');error.ui10ShellPartial=result;error.ui10ShellCleanup=failures;throw error;}
 }
}

/** At most three observations share one six-second budget. No sleep, desired
 * geometry wait, DOM action, RPC, or repaint retry is performed. */
export async function observeUi10ShellConsistently(frame,assertBounds,{now=()=>performance.now(),timeoutMs=6000,capture=captureAttempt}={}){
 assert(Number.isFinite(timeoutMs)&&timeoutMs>0&&timeoutMs<=6000,'ui10-shell-invalid-deadline');
 const started=now(),diagnostic={kind:'READ_ONLY_SHELL_CONSISTENCY',old74FailureCause:'UNKNOWN',deadlineMs:timeoutMs,maxAttempts:3,attempts:[],cleanupErrors:[],lateCleanupPending:0};
 let active=true;
 const remaining=()=>{const elapsed=now()-started;if(!active||!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs)throw Error('ui10-shell-observation-deadline');return timeoutMs-elapsed;};
 async function cleanup(work){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ui10-shell-cleanup-timeout')),1000);})]);}finally{clearTimeout(timer);}}
 async function run(work,lateCleanup){
  const left=remaining();let timer,expired=false,received=false,value;
  const pending=Promise.resolve().then(()=>{remaining();return work();});
  if(lateCleanup)void pending.then(async value=>{if(expired){try{await cleanup(()=>lateCleanup(value));}catch(error){diagnostic.cleanupErrors.push(error.message);}finally{diagnostic.lateCleanupPending--;}}},()=>{if(expired)diagnostic.lateCleanupPending--;});
  try{value=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;active=false;if(lateCleanup)diagnostic.lateCleanupPending++;reject(Error('ui10-shell-observation-deadline'));},left);})]);received=true;remaining();return value;}
  catch(error){if(received&&lateCleanup)try{await cleanup(()=>lateCleanup(value));}catch(cleanupError){diagnostic.cleanupErrors.push(cleanupError.message);}throw error;}
  finally{clearTimeout(timer);}
 }
 try{
  for(let index=0;index<3;index++){
   remaining();const record={attempt:index+1};diagnostic.attempts.push(record);
   let value;try{value=await run(()=>capture(frame,run,cleanup,record));}catch(error){record.sample=error.ui10ShellPartial??record.sample??null;if(error.ui10ShellCleanup)diagnostic.cleanupErrors.push(...error.ui10ShellCleanup);throw error;}
   record.sample=value;remaining();record.discardReasons=ui10ShellInconsistency(value);
   if(record.discardReasons.length){record.status='DISCARDED_INCONSISTENT_SNAPSHOT';continue;}
   const {before,after,final,child}=value,measurement=child.measurement,outer={...before,closeHit:before.closeHit&&after.closeHit&&final.closeHit};
   if(outer.backend==='document-flow')outer.closeCoversControl=child.controls.some(({rect:r,visible})=>r.width>0&&r.height>0&&visible&&r.right+outer.frame.x>outer.close.left&&r.left+outer.frame.x<outer.close.right&&r.bottom+outer.frame.y>outer.close.top&&r.top+outer.frame.y<outer.close.bottom);
   // Run the unmodified geometry oracle immediately on a consistent sample.
   // Missing actual renderer nodes are a separate failure, never a retry.
   record.status='CONSISTENT_ORACLE_PENDING';assertBounds(measurement,outer);
   assert(Object.values(child.presence).every(value=>value===true),'ui10-shell-renderer-missing');
   record.status='PASS_CONSISTENT_SNAPSHOT';diagnostic.elapsedMs=now()-started;
   return {measurement,outer,observation:diagnostic,evidence:'SHELL_GEOMETRY_ONLY',fullV27Acceptance:'NOT_ESTABLISHED'};
  }
  throw Error('ui10-shell-consistency-attempt-limit');
 }catch(error){const record=diagnostic.attempts.at(-1);if(record?.status==='CONSISTENT_ORACLE_PENDING')record.status='FAIL_CONSISTENT_SNAPSHOT';else if(record&&!record.status)record.status='FAIL_OBSERVATION';diagnostic.elapsedMs=now()-started;diagnostic.failure=error.message;error.ui10ShellDiagnostics=diagnostic;throw error;}
 finally{active=false;}
}
