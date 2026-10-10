import { env } from './environment.mjs';
import { createNavigation } from '../src/navigation/navigation.mjs';
import { createAdapter } from './adapter.mjs';
import { dataset, routeInfo, FIXTURE_NOW } from './data.mjs';
/** Shared content client, used byte-identically by real MV3 bundle and explicitly-labelled page transport. */
export function startClient({send,invalidateRemote=()=>{},readControls=()=>({size:Number(document.documentElement.dataset.hfSize)||8,now:document.documentElement.dataset.hfNow||FIXTURE_NOW,timeZone:document.documentElement.dataset.hfTimeZone||'Asia/Shanghai'}),subscribe=()=>()=>{}}) {
  const adapter=createAdapter(),clientId=crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');let seq=0,generation=0,lease=null,expiry=null,pending=null,stopped=false,lastURL=env.location.href;
  const controlKey=()=>{const c=readControls();return JSON.stringify([c.size,c.now,c.timeZone]);};let lastControls=controlKey();
  let navigation=createNavigation({document,adapter,onExit:()=>stop()});
  const fail=reason=>{navigation.invalidate(reason);};
  async function load(){
    if(stopped)return;const ticket=++generation,url=env.location.href;clearTimeout(expiry);fail('validating-binding');lease=null;
    try{
      const bound=await send({v:1,type:'BIND',clientId,seq:++seq});
      if(stopped||ticket!==generation||url!==env.location.href)return;
      if(!bound?.ok){fail(bound?.reason??'bind-failed');return;}
      lease=bound;const reply=await send({v:1,type:'LIST_REFS',clientId,seq:++seq,leaseId:lease.leaseId});
      if(stopped||ticket!==generation||url!==env.location.href)return;
      if(!reply?.ok){fail(reply?.reason??'read-failed');return;}
      const info=routeInfo(url),controls=readControls(),data=dataset(info.account,info.origin,controls.size??8),allowed=new Map(reply.records.map(r=>[r.conversationId,r]));
      data.refs=data.refs.filter(r=>{const actual=allowed.get(r.id);return actual?.nativeUrl===r.nativeUrl&&actual.projectId===r.projectId;});
      navigation.update(data,controls.now??FIXTURE_NOW,controls.timeZone??'Asia/Shanghai');const host=adapter.inspect();if(host.ok){resize.observe(host.reading);resize.observe(host.header);}
      expiry=setTimeout(()=>{generation++;lease=null;fail('lease-expired-active-js');},Math.max(0,lease.expiresAt-Date.now()));
    }catch(e){if(ticket===generation)fail('transport-failure');}
  }
  function changed(){
    if(stopped)return;
    if(lastURL!==env.location.href||lastControls!==controlKey()){lastURL=env.location.href;lastControls=controlKey();generation++;invalidateRemote();fail('route-changed');clearTimeout(pending);pending=setTimeout(load,0);}
    else navigation.layout();
  }
  const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-vaiwl-owned]')&&!(r.type==='attributes'&&r.attributeName?.startsWith('data-vaiwl'))))changed();});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','data-collapsed','inert']});
  const resize=new ResizeObserver(()=>navigation.layout());resize.observe(document.documentElement);const nativeChange=()=>changed();document.addEventListener('hf:change',nativeChange);
  document.addEventListener('toggle',nativeChange,true);addEventListener('popstate',nativeChange);addEventListener('resize',nativeChange);
  const unsub=subscribe(()=>{generation++;fail('browser-document-invalidated');clearTimeout(pending);pending=setTimeout(load,0);});
  const hide=()=>{if(document.visibilityState==='hidden'){generation++;lease=null;invalidateRemote();fail('hidden-document');}else void load();};document.addEventListener('visibilitychange',hide);
  const refresh=()=>{generation++;invalidateRemote();void load();};
  function stop(){if(stopped)return;stopped=true;generation++;clearTimeout(expiry);clearTimeout(pending);observer.disconnect();resize.disconnect();unsub();document.removeEventListener('hf:change',nativeChange);document.removeEventListener('toggle',nativeChange,true);document.removeEventListener('visibilitychange',hide);removeEventListener('popstate',nativeChange);removeEventListener('resize',nativeChange);navigation.stop();}
  void load();return {stop,refresh,showWorkspace:()=>navigation.showWorkspace(),status:()=>navigation.status(),navigation};
}
