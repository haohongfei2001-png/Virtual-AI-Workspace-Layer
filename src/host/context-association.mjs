import {createCurrentBodyDiscovery} from './current-body-discovery.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Isolated fixed-profile metadata only. A bounded DOM wait never creates a
 * receipt, reads credentials or starts a new authentication/network request. */
export function createContextAssociationBridge({document,runtime,origin,profile,isOwnedMask=()=>false,onPending=()=>{},onReady=()=>{},now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const discovery=createCurrentBodyDiscovery({document,profile,isOwnedMask,urlPolicy:createURLPolicy({origin})});let active=true,pending=null;
 function finish(state,answer=null){
  if(pending!==state)return;pending=null;cancel(state.timer);cancel(state.scanTimer);state.observer?.disconnect();
  document.defaultView.removeEventListener?.('popstate',state.leave);document.defaultView.removeEventListener?.('hashchange',state.leave);document.defaultView.removeEventListener?.('pagehide',state.leave);
  try{state.reply(answer);}catch{/* Closed runtime channel does not retain an observer. */}
 }
 const abort=()=>{if(pending)finish(pending);};
 function valid(state){
  const wall=now(),elapsed=elapsedNow();
  if(!active||pending!==state||document.location.href!==state.message.actualURL||!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<state.wall||elapsed<state.elapsed||wall>=state.until||elapsed-state.started>=state.budget)return false;
  state.wall=wall;state.elapsed=elapsed;return true;
 }
 function scan(state){
  if(!valid(state)){finish(state);return;}
  const claim=discovery.scan();if(!valid(state)){finish(state);return;}
  if(claim.association==='explicit-body-id'&&claim.conversationId===state.message.conversationId)finish(state,{challenge:state.message.challenge,actualURL:state.message.actualURL,conversationId:claim.conversationId,association:claim.association});
 }
 const listener=(m,sender,reply)=>{
  if(!active||sender?.id!==runtime.id||sender.tab)return;
  if(exactHostRecord(m,['type'])&&m.type==='HOST_CONTEXT_PENDING'){abort();onPending();return;}
  if(exactHostRecord(m,['type'])&&m.type==='HOST_CONTEXT_READY'){onReady();return;}
  if(!exactHostRecord(m,['type','challenge','actualURL','conversationId','expiresAt'])||m.type!=='HOST_CONTEXT_ASSOCIATE'||!tokenOK(m.challenge)||!tokenOK(m.conversationId)||m.actualURL!==document.location.href||typeof m.expiresAt!=='string')return;
  const until=Date.parse(m.expiresAt),at=now(),started=elapsedNow();if(!Number.isFinite(until)||!Number.isFinite(at)||!Number.isFinite(started)||until<=at||until-at>6000)return;
  // A duplicate cannot replace its original clock; a new owner challenge may
  // supersede an aborted session, but there is never more than one DOM waiter.
  if(pending?.message.challenge===m.challenge){reply(null);return;}
  abort();const state={message:{...m},reply,until,budget:until-at,started,wall:at,elapsed:started,timer:null,scanTimer:null,observer:null,leave:()=>finish(state)};pending=state;
  scan(state);if(pending!==state)return;
  const win=document.defaultView;
  if(typeof win.MutationObserver!=='function'||!document.documentElement||!profile.currentBody){finish(state);return;}
  try{
   state.observer=new win.MutationObserver(()=>{
    if(!valid(state)){finish(state);return;}if(state.scanTimer!==null)return;
    state.scanTimer=schedule(()=>{state.scanTimer=null;scan(state);},Math.min(100,state.until-now(),state.budget-(elapsedNow()-state.started)));
   });
   state.observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:[profile.currentBody.conversationIdAttribute,'hidden','aria-hidden','class','style']});
   for(const event of ['popstate','hashchange','pagehide'])win.addEventListener?.(event,state.leave);
   state.timer=schedule(()=>finish(state),Math.min(state.until-now(),state.budget-(elapsedNow()-state.started)));
   // Recheck after observer installation, including an elapsed deadline.
   scan(state);
  }catch{finish(state);}
  return pending===state?true:undefined;
 };
 runtime.onMessage.addListener(listener);
 function stop(){active=false;abort();runtime.onMessage.removeListener(listener);discovery.stop();}
 return Object.freeze({stop});
}
