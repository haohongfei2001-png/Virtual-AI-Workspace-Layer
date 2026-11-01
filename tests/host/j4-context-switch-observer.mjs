import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {randomUUID} from 'node:crypto';

// Isolated fixture diagnostics only. No handler replacement, network request,
// DOM mutation, navigation, retry or change to the original action deadline.
export function installJ4ContextSwitchProbe(token){
 const key='__vaiwlJ4ContextSwitchProbe';
 if(globalThis[key])throw Error('context-switch-probe-already-present');
 const events=[],listeners=[];let dropped=0;
 const targetOf=event=>{const path=event.composedPath();
  if(path.some(n=>n?.id==='account-button'))return 'account';
  const button=path.find(n=>n?.tagName==='BUTTON'&&n.closest?.('#native-dialog'));
  if(button?.textContent==='Switch to Personal')return 'personal';
  if(button?.textContent==='Switch to Team')return 'team';
  return path.some(n=>n?.id==='native-dialog')?'dialog':'other';
 };
 const add=(target,type,phase)=>{const listener=event=>{
  if(events.length>=64){dropped++;return;}
  events.push({type,phase,target:type==='beforeunload'||type==='pagehide'?'document':targetOf(event),trusted:event.isTrusted===true,defaultPrevented:event.defaultPrevented===true,dialogOpen:document.querySelector('#native-dialog')?.open===true});
 };target.addEventListener(type,listener,phase==='capture');listeners.push(()=>target.removeEventListener(type,listener,phase==='capture'));};
 for(const type of ['pointerdown','pointerup','click'])for(const phase of ['capture','bubble'])add(document,type,phase);
 for(const type of ['beforeunload','pagehide'])add(globalThis,type,'capture');
 globalThis[key]={token,finish(){for(const remove of listeners)remove();delete globalThis[key];return {state:'ORIGINAL_DOCUMENT_CAPTURE',events,dropped};}};
 return token;
}

export async function observeJ4ContextSwitch(page,{origin}={}){
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin??'')||Number(new URL(origin).port)>65535)throw Error('context-switch-offline-origin');
 const events=[],requests=new WeakMap(),token=randomUUID();let dropped=0,next=0,closed=false,setup='PENDING',finishTask;
 const emit=event=>{if(closed)return;if(events.length>=32)dropped++;else events.push(event);};
 const target=request=>{try{return request.url()===origin+'/native/context'&&request.frame()===page.mainFrame();}catch{return false;}};
 const start=request=>{if(!target(request))return;const requestId=++next;requests.set(request,requestId);emit({type:'request',request:requestId,method:request.method()==='POST'?'POST':'OTHER'});};
 const response=value=>{const requestId=requests.get(value.request());if(requestId)emit({type:'response',request:requestId,status:Number.isInteger(value.status())?value.status():null});};
 const failed=request=>{const requestId=requests.get(request);if(!requestId)return;const reason=request.failure()?.errorText;emit({type:'requestfailed',request:requestId,reason:typeof reason==='string'&&/^net::ERR_[A-Z_]+$/.test(reason)?reason:'OTHER'});};
 page.on('request',start);page.on('response',response);page.on('requestfailed',failed);
 const bounded=work=>withRequestDeadline(work,{timeoutMs:1500});
 try{setup=await bounded(()=>page.evaluate(installJ4ContextSwitchProbe,token))===token?'INSTALLED':'UNAVAILABLE';}catch{setup='UNAVAILABLE';}
 return {finish(snapshot={}){
  if(!finishTask)finishTask=(async()=>{
   closed=true;page.off('request',start);page.off('response',response);page.off('requestfailed',failed);
   let document={state:'CAPTURE_UNAVAILABLE'};
   try{document=await bounded(()=>page.evaluate(expected=>{const probe=globalThis.__vaiwlJ4ContextSwitchProbe;if(!probe||probe.token!==expected)return {state:'DOCUMENT_REPLACED_OR_PROBE_MISSING'};return probe.finish();},token));}catch{}
   const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
   return {kind:'PASSIVE_NATIVE_CONTEXT_SWITCH_NOT_ACCEPTANCE',setup,document,network:{events,dropped},server:{requests:count(snapshot.requests?.['/native/context']??0),successfulSwitches:count(snapshot.actions?.['context-switch']??0)},originalActionRepeated:false};
  })();return finishTask;
 }};
}
