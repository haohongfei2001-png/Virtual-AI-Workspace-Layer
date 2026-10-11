const randomId=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
import { env } from './environment.mjs';
import { createNavigation } from '../src/navigation/navigation.mjs';
import { createAdapter } from './adapter.mjs';
import { FIXTURE_NOW } from './data.mjs';
import { openWorkspaceEditor } from './editor.mjs';
/** B4 observes versions and renews authority; it never automatically replays a write. */
export function startClient({send,invalidateRemote=()=>{},readControls=()=>({size:Number(document.documentElement.dataset.hfSize)||8,now:document.documentElement.dataset.hfNow||FIXTURE_NOW,timeZone:document.documentElement.dataset.hfTimeZone||'Asia/Shanghai'}),subscribe=()=>()=>{}}){
  const adapter=createAdapter(),clientId=randomId();let seq=0,generation=0,lease=null,expiry=null,pending=null,heartbeat=null,stopped=false,lastURL=env.location.href;
  let data=null,editor=null,retries=0,viewTimer=null,viewRevision=0,lastView='',chain=Promise.resolve(),feedback=null;
  const visible=()=>document.visibilityState!=='hidden';
  const controlsKey=()=>{const c=readControls();return JSON.stringify([c.size,c.now,c.timeZone]);};let lastControls=controlsKey();
  const queue=fn=>{const task=chain.then(fn);chain=task.catch(()=>{});return task;};
  const request=async(type,extra={})=>{try{return await send({v:1,type,clientId,seq:++seq,...(type==='BIND'?{}:{leaseId:lease?.leaseId}),...extra});}catch{throw Error('transport-unavailable');}};
  const navigation=createNavigation({document,adapter,onExit:()=>stop(),onManage:()=>void manage(),onViewChange:(value,scope)=>saveViewSoon(value,scope)});
  const clearTimers=()=>{clearTimeout(expiry);clearTimeout(pending);clearTimeout(heartbeat);clearTimeout(viewTimer);};
  const clearFeedback=()=>{feedback?.remove();feedback=null;};
  function showFeedback(reason){
    clearFeedback();if(!visible()||stopped)return;
    feedback=document.createElement('div');feedback.dataset.vaiwlOwned='connection-status';feedback.setAttribute('role','status');feedback.style.cssText='font:12px/1.5 system-ui;padding:6px 12px';
    const text=document.createElement('span');text.textContent=reason==='unverified-scope'?'身份尚未确认，派生内容已隐藏。':retries>=5?'派生工作空间暂时无法连接，原生聊天仍可使用。':'派生工作空间正在重新连接，原生聊天仍可使用。';feedback.append(text);
    const button=document.createElement('button');button.type='button';button.textContent='重新连接派生工作空间';button.onclick=()=>{retries=0;void load();};feedback.append(button);document.body.prepend(feedback);
  }
  function fail(reason,preserve=false){if(editor){if(preserve)editor.suspend();else{editor.close();editor=null;}}navigation.invalidate(reason);}
  function current(ticket,url){return !stopped&&visible()&&ticket===generation&&url===env.location.href;}
  const retryable=reason=>['invalidated-during-check','stale-document','not-current-document','stale-binding','stale-after-workspace','stale-client-response','transport-unavailable','binding-not-ready','lease-expired-active-js'].includes(reason);
  function recover(reason,{preserve=true,immediate=false}={}){
    if(stopped)return;generation++;lease=null;data=null;clearTimers();fail(reason,preserve&&retryable(reason));showFeedback(reason);
    if(!visible()||!retryable(reason)||retries>=5)return;
    const ticket=generation,url=env.location.href,delay=immediate?0:[90,180,360,1000,2000][retries++];
    pending=setTimeout(()=>{if(current(ticket,url))void load();},delay);
  }
  async function readSnapshot(ticket,url){
    const c=readControls(),reply=await request('B23_SNAPSHOT',{now:c.now??FIXTURE_NOW,timeZone:c.timeZone??'Asia/Shanghai',size:c.size??8});
    if(!current(ticket,url))throw Error('stale-client-response');if(!reply?.ok)throw Error(reply?.reason??'read-failed');
    const next=reply.snapshot;
    if(data?.scope===next.scope&&next.revision<data.revision)return data;
    const changed=!data||data.revision!==next.revision||data.viewRevision!==next.viewRevision||data.diagnostics?.view!==next.diagnostics?.view;
    data=next;viewRevision=data.viewRevision;
    if(lastView===''&&data.view)lastView=JSON.stringify(data.view);
    if(changed){navigation.update(data,c.now??FIXTURE_NOW,c.timeZone??'Asia/Shanghai');if(editor&&!editor.resume(data))editor=null;}
    clearFeedback();const host=adapter.inspect();if(host.ok){resize.observe(host.reading);resize.observe(host.header);}return data;
  }
  function scheduleHeartbeat(){clearTimeout(heartbeat);if(!visible()||!lease||stopped)return;const ticket=generation,url=env.location.href;
    heartbeat=setTimeout(()=>void queue(async()=>{
      if(!current(ticket,url)||!lease)return;
      try{const reply=await request('CHECK');if(!current(ticket,url))return;if(!reply?.ok)throw Error(reply?.reason??'check-failed');
        if(reply.revision!==undefined&&(reply.revision!==data?.revision||reply.viewRevision!==viewRevision||reply.viewDiagnostic!==data?.diagnostics?.view))await readSnapshot(ticket,url);
        if(current(ticket,url))scheduleHeartbeat();
      }catch(e){if(current(ticket,url))recover(e.message);}
    }),2000);
  }
  async function load(){
    if(stopped||!visible())return;const ticket=++generation,url=env.location.href;clearTimers();fail('validating-binding',true);lease=null;data=null;lastView='';
    try{const bound=await request('BIND');if(!current(ticket,url))return;if(!bound?.ok)throw Error(bound?.reason??'bind-failed');
      lease=bound;await queue(()=>readSnapshot(ticket,url));if(!current(ticket,url))return;retries=0;
      expiry=setTimeout(()=>recover('lease-expired-active-js',{immediate:true}),Math.max(0,lease.expiresAt-Date.now()));scheduleHeartbeat();
    }catch(e){if(current(ticket,url))recover(e.message);}
  }
  function requireBinding(){if(!lease||!data||stopped||!visible()||Date.now()>=lease.expiresAt)throw Error('binding-not-ready');}
  async function command(value,expectedRevision){
    return queue(async()=>{try{requireBinding();}catch(e){recover(e.message);throw e;}
      const ticket=generation,url=env.location.href,revision=expectedRevision??data.revision;
      let result;try{result=await request('B23_COMMAND',{operationId:'manual_'+randomId().replaceAll('-',''),expectedRevision:revision,command:value});}
      catch(e){if(current(ticket,url))recover(e.message);throw Error('write-result-unknown');}
      if(!current(ticket,url))throw Error('write-result-unknown');
      // A known result remains known even if the following read loses its binding.
      try{await readSnapshot(ticket,url);}catch(e){if(current(ticket,url))recover(e.message);if(result?.ok)throw Error('write-result-unknown');}
      if(!result?.ok){if(retryable(result?.reason))recover(result.reason);throw Error(result?.reason??'write-result-unknown');}return result;
    });
  }
  async function undo(){return queue(async()=>{
    requireBinding();const ticket=generation,url=env.location.href;
    try{const log=await request('B23_HISTORY');if(!current(ticket,url))throw Error('stale-client-response');if(!log.ok)throw Error(log.reason);
      const prior=log.history.find(x=>x.actor==='human'&&!x.undoneBy&&!x.invalidatedBy&&['CREATE_WORKSPACE','UPDATE_WORKSPACE','SET_TITLE','PLACE','MOVE','SET_PREFERENCE'].includes(x.type));if(!prior)throw Error('nothing-to-undo');
      const result=await request('B23_UNDO',{operationId:'undo_'+randomId().replaceAll('-',''),expectedRevision:data.revision,targetOperationId:prior.id});
      if(!current(ticket,url))throw Error('write-result-unknown');await readSnapshot(ticket,url);if(!result.ok)throw Error(result.reason);return result;
    }catch(e){if(current(ticket,url)&&retryable(e.message))recover(e.message);throw e;}
  });}
  async function manage(){if(!data)await load();if(!data||stopped||!visible())return;editor?.close();editor=openWorkspaceEditor({snapshot:data,command,undo,onClose:()=>{editor=null;navigation.layout();}});}
  function saveViewSoon(value,scope){
    if(!data||scope!==data.scope||stopped)return;const encoded=JSON.stringify(value);if(encoded===lastView)return;lastView=encoded;clearTimeout(viewTimer);const ticket=generation,url=env.location.href;
    viewTimer=setTimeout(()=>void queue(async()=>{if(!current(ticket,url)||!lease||data?.scope!==scope)return;
      try{const result=await request('B23_SAVE_VIEW',{value,expectedRevision:viewRevision});if(!current(ticket,url))return;if(result?.ok)viewRevision=result.revision;else{document.documentElement.dataset.vaiwlViewSave=result?.reason??'view-save-failed';lastView='';if(retryable(result?.reason))recover(result.reason);}}
      catch(e){if(current(ticket,url))recover(e.message);}
    }),180);
  }
  function changed(){if(stopped)return;if(lastURL!==env.location.href||lastControls!==controlsKey()){
      lastURL=env.location.href;lastControls=controlsKey();generation++;invalidateRemote();clearTimers();fail('route-changed');lease=null;data=null;retries=0;clearFeedback();pending=setTimeout(load,0);
    }else navigation.layout();}
  const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-vaiwl-owned]')&&!(r.type==='attributes'&&r.attributeName?.startsWith('data-vaiwl'))))changed();});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','data-collapsed','inert']});
  const resize=new ResizeObserver(()=>navigation.layout());resize.observe(document.documentElement);const nativeChange=()=>changed();document.addEventListener('hf:change',nativeChange);
  document.addEventListener('toggle',nativeChange,true);addEventListener('popstate',nativeChange);addEventListener('resize',nativeChange);
  const unsub=subscribe(()=>recover('stale-binding',{immediate:true}));
  const hide=()=>{if(!visible()){generation++;clearTimers();lease=null;data=null;invalidateRemote();fail('hidden-document',true);clearFeedback();}else{retries=0;void load();}};
  const pageHide=()=>{generation++;clearTimers();lease=null;data=null;invalidateRemote();fail('page-hidden',true);clearFeedback();};
  const resume=()=>{if(!stopped&&visible()){retries=0;void load();}};
  document.addEventListener('visibilitychange',hide);document.addEventListener('freeze',pageHide);document.addEventListener('resume',resume);addEventListener('pagehide',pageHide);addEventListener('pageshow',resume);
  const refresh=()=>{generation++;invalidateRemote();retries=0;return load();};
  function stop(){if(stopped)return;stopped=true;generation++;clearTimers();clearFeedback();editor?.close();observer.disconnect();resize.disconnect();unsub();document.removeEventListener('hf:change',nativeChange);document.removeEventListener('toggle',nativeChange,true);document.removeEventListener('visibilitychange',hide);document.removeEventListener('freeze',pageHide);document.removeEventListener('resume',resume);removeEventListener('pagehide',pageHide);removeEventListener('pageshow',resume);removeEventListener('popstate',nativeChange);removeEventListener('resize',nativeChange);navigation.stop();}
  void load();return {stop,refresh,command,undo,manage,showWorkspace:()=>navigation.showWorkspace(),status:()=>navigation.status(),navigation};
}
