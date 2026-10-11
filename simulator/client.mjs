const randomId=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
import { env } from './environment.mjs';
import { createNavigation } from '../src/navigation/navigation.mjs';
import { createAdapter } from './adapter.mjs';
import { FIXTURE_NOW } from './data.mjs';
import { openWorkspaceEditor } from './editor.mjs';
/** Shared page/MV3 client. Workspace data comes from B1-backed durable B2/B3,
 * never reconstructed from the synthetic catalogue on every load.
 */
export function startClient({send,invalidateRemote=()=>{},readControls=()=>({size:Number(document.documentElement.dataset.hfSize)||8,now:document.documentElement.dataset.hfNow||FIXTURE_NOW,timeZone:document.documentElement.dataset.hfTimeZone||'Asia/Shanghai'}),subscribe=()=>()=>{}}){
  const adapter=createAdapter(),clientId=randomId();let seq=0,generation=0,lease=null,expiry=null,pending=null,stopped=false,lastURL=env.location.href;
  let data=null,editor=null,transientRetries=0,viewTimer=null,viewRevision=0,lastView='',chain=Promise.resolve();
  const controlsKey=()=>{const c=readControls();return JSON.stringify([c.size,c.now,c.timeZone]);};let lastControls=controlsKey();
  const queue=fn=>{const task=chain.then(fn);chain=task.catch(()=>{});return task;};
  const request=(type,extra={})=>send({v:1,type,clientId,seq:++seq,...(type==='BIND'?{}:{leaseId:lease?.leaseId}),...extra});
  const navigation=createNavigation({document,adapter,onExit:()=>stop(),onManage:()=>void manage(),onViewChange:(value,scope)=>saveViewSoon(value,scope)});
  const fail=reason=>{editor?.close();editor=null;navigation.invalidate(reason);};
  function retryTransient(reason,ticket,url){fail(reason);if(!['invalidated-during-check','stale-document','not-current-document'].includes(reason)||transientRetries>=3)return;
    clearTimeout(pending);pending=setTimeout(()=>{if(!stopped&&ticket===generation&&url===env.location.href)void load();},[90,180,360][transientRetries++]);}
  function current(ticket,url){return !stopped&&ticket===generation&&url===env.location.href;}
  async function readSnapshot(ticket,url){
    const c=readControls(),reply=await request('B23_SNAPSHOT',{now:c.now??FIXTURE_NOW,timeZone:c.timeZone??'Asia/Shanghai',size:c.size??8});
    if(!current(ticket,url))throw Error('stale-client-response');if(!reply?.ok)throw Error(reply?.reason??'read-failed');
    data=reply.snapshot;viewRevision=data.viewRevision;
    // Initialize the persisted-view comparison before first render, not after a callback.
    if(lastView===''&&data.view)lastView=JSON.stringify(data.view);
    navigation.update(data,c.now??FIXTURE_NOW,c.timeZone??'Asia/Shanghai');editor?.update(data);
    const host=adapter.inspect();if(host.ok){resize.observe(host.reading);resize.observe(host.header);}return data;
  }
  async function load(){
    if(stopped)return;const ticket=++generation,url=env.location.href;clearTimeout(expiry);clearTimeout(viewTimer);fail('validating-binding');lease=null;data=null;lastView='';
    try{const bound=await request('BIND');if(!current(ticket,url))return;if(!bound?.ok){retryTransient(bound?.reason??'bind-failed',ticket,url);return;}
      lease=bound;await queue(()=>readSnapshot(ticket,url));if(!current(ticket,url))return;transientRetries=0;
      expiry=setTimeout(()=>{generation++;lease=null;data=null;fail('lease-expired-active-js');},Math.max(0,lease.expiresAt-Date.now()));
    }catch(e){if(current(ticket,url))retryTransient(e.message,ticket,url);}
  }
  async function command(value){
    return queue(async()=>{if(!lease||!data||stopped)throw Error('binding-not-ready');const ticket=generation,url=env.location.href,expectedRevision=data.revision;
      const result=await request('B23_COMMAND',{operationId:'manual_'+randomId().replaceAll('-',''),expectedRevision,command:value});
      if(!current(ticket,url))throw Error('stale-client-response');await readSnapshot(ticket,url);
      if(!result?.ok)throw Error(result?.reason??'unknown-command-result');return result;
    });
  }
  async function undo(){return queue(async()=>{
    if(!lease||!data)throw Error('binding-not-ready');const ticket=generation,url=env.location.href;
    const log=await request('B23_HISTORY');if(!current(ticket,url))throw Error('stale-client-response');if(!log.ok)throw Error(log.reason);
    const prior=log.history.find(x=>x.actor==='human'&&!x.undoneBy&&!x.invalidatedBy&&['CREATE_WORKSPACE','UPDATE_WORKSPACE','SET_TITLE','PLACE','MOVE','SET_PREFERENCE'].includes(x.type));if(!prior)throw Error('nothing-to-undo');
    const result=await request('B23_UNDO',{operationId:'undo_'+randomId().replaceAll('-',''),expectedRevision:data.revision,targetOperationId:prior.id});
    if(!current(ticket,url))throw Error('stale-client-response');await readSnapshot(ticket,url);if(!result.ok)throw Error(result.reason);return result;
  });}
  async function manage(){if(!data){await load();}if(!data||stopped)return;editor?.close();editor=openWorkspaceEditor({snapshot:data,command,undo,onClose:()=>{editor=null;navigation.layout();}});}
  function saveViewSoon(value,scope){
    if(!data||scope!==data.scope||stopped)return;const encoded=JSON.stringify(value);if(encoded===lastView)return;lastView=encoded;clearTimeout(viewTimer);const ticket=generation,url=env.location.href;
    viewTimer=setTimeout(()=>void queue(async()=>{
      if(!current(ticket,url)||!lease||data?.scope!==scope)return;
      const result=await request('B23_SAVE_VIEW',{value,expectedRevision:viewRevision});
      if(!current(ticket,url))return;if(result?.ok)viewRevision=result.revision;
      else{document.documentElement.dataset.vaiwlViewSave=result?.reason??'view-save-failed';lastView='';}
    }).catch(()=>{}),180);
  }
  function changed(){if(stopped)return;if(lastURL!==env.location.href||lastControls!==controlsKey()){
      lastURL=env.location.href;lastControls=controlsKey();generation++;invalidateRemote();fail('route-changed');clearTimeout(pending);pending=setTimeout(load,0);
    }else navigation.layout();}
  const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-vaiwl-owned]')&&!(r.type==='attributes'&&r.attributeName?.startsWith('data-vaiwl'))))changed();});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','data-collapsed','inert']});
  const resize=new ResizeObserver(()=>navigation.layout());resize.observe(document.documentElement);const nativeChange=()=>changed();document.addEventListener('hf:change',nativeChange);
  document.addEventListener('toggle',nativeChange,true);addEventListener('popstate',nativeChange);addEventListener('resize',nativeChange);
  const unsub=subscribe(()=>{generation++;fail('browser-document-invalidated');clearTimeout(pending);pending=setTimeout(load,0);});
  const hide=()=>{if(document.visibilityState==='hidden'){generation++;lease=null;data=null;invalidateRemote();fail('hidden-document');}else void load();};document.addEventListener('visibilitychange',hide);
  const refresh=()=>{generation++;invalidateRemote();return load();};
  function stop(){if(stopped)return;stopped=true;generation++;clearTimeout(expiry);clearTimeout(pending);clearTimeout(viewTimer);editor?.close();observer.disconnect();resize.disconnect();unsub();document.removeEventListener('hf:change',nativeChange);document.removeEventListener('toggle',nativeChange,true);document.removeEventListener('visibilitychange',hide);removeEventListener('popstate',nativeChange);removeEventListener('resize',nativeChange);navigation.stop();}
  void load();return {stop,refresh,command,undo,manage,showWorkspace:()=>navigation.showWorkspace(),status:()=>navigation.status(),navigation};
}
