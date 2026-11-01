/** Passive, bounded diagnostics for the isolated LEGACY startup only. No product
 * functions, network APIs, DOM methods, readiness predicates or timers are changed. */
export function installStartupSurfaceObserver({fixtureOrigin,extensionOrigin}){
 if(globalThis.top!==globalThis.self||location.origin!==fixtureOrigin||!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureOrigin)||!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin))return;
 const selectors={history:'aside nav[aria-label="Chat history"]',header:'main > header',reading:'main > section[aria-label="Conversation"]',composer:'main > form#composer',slot:'main > header > .navigation-slot'};
 const events=[],issues=new Set(),identities=new WeakMap(),listeners=[];let identity=0,dropped=0,closed=false,mutationObserver,resourceObserver,final=null;
 const limit=256,roots={};
 const id=node=>{if(!identities.has(node))identities.set(node,++identity);return identities.get(node);};
 const safe=fn=>(...args)=>{if(closed)return;try{return fn(...args);}catch{issues.add('observation-error');}};
 function regions(){const result={};for(const [role,selector]of Object.entries(selectors)){const nodes=[...document.querySelectorAll(selector)];roots[role]=nodes.length===1?nodes[0]:null;result[role]={count:Math.min(nodes.length,2),generation:roots[role]?id(roots[role]):null,connected:roots[role]?.isConnected===true};}return result;}
 function role(node){
  if(!node?.matches?.('section[data-va-owned][popover="manual"]'))return 'other';
  const frames=node.querySelectorAll('iframe');if(frames.length!==1)return 'other';
  const src=frames[0].getAttribute('src');for(const name of ['workspace','sidebar'])if(src===extensionOrigin+'/'+name+'.html')return name;
  return 'other';
 }
 function surfaces(){const value={workspace:0,sidebar:0,other:0};for(const node of document.querySelectorAll('section[data-va-owned][popover="manual"]:popover-open'))value[role(node)]++;return value;}
 function record(type,fields={}){if(closed)return;if(events.length>=limit){dropped++;return;}events.push({sequence:events.length+1,at:performance.now(),type,...fields});}
 function mutations(records,phase='callback'){
  const before={...roots},after=regions(),changes=[];
  for(const name of Object.keys(selectors)){
   const nodes=[before[name],roots[name]].filter(Boolean),affected=records.filter(r=>nodes.some(node=>r.target===node||node.contains(r.target)||r.type==='attributes'&&r.target.contains?.(node)||r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n===node||n.contains?.(node))));
   if(!affected.length&&before[name]===roots[name])continue;
   changes.push({region:name,replaced:before[name]!==roots[name],childLists:affected.filter(r=>r.type==='childList').length,added:affected.reduce((n,r)=>n+(r.addedNodes?.length??0),0),removed:affected.reduce((n,r)=>n+(r.removedNodes?.length??0),0),attributes:[...new Set(affected.filter(r=>r.type==='attributes').map(r=>r.attributeName))].filter(n=>['class','style','hidden','aria-hidden','open','aria-modal'].includes(n))});
  }
  if(changes.length)record('regions',{phase,changes,regions:after,surfaces:surfaces()});
 }
 function resources(entries){for(const entry of entries){let url;try{url=new URL(entry.name);}catch{continue;}if(url.origin!==fixtureOrigin||url.pathname!=='/native/route')continue;const timing={};for(const key of ['startTime','responseStart','responseEnd','duration'])timing[key]=Number.isFinite(entry[key])?entry[key]:null;record('native-route-resource',{timing});}}
 const listen=(target,type,callback)=>{const handler=safe(callback);target.addEventListener(type,handler,true);listeners.push([target,type,handler]);};
 function finish(){
  if(final)return structuredClone(final);
  try{mutations(mutationObserver?.takeRecords()??[],'drained');resources(resourceObserver?.takeRecords()??[]);}catch{issues.add('observation-error');}
  closed=true;mutationObserver?.disconnect();resourceObserver?.disconnect();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler,true);
  final={kind:'OFFLINE_STARTUP_PASSIVE_DIAGNOSTIC',status:dropped||issues.size?'INCOMPLETE':'COMPLETE_PASSIVE_TRACE',clock:'document-performance',limit,dropped,issues:[...issues],events};return structuredClone(final);
 }
 Object.defineProperty(globalThis,'__vaiwlOfflineStartup',{value:Object.freeze({finish}),configurable:true});
 try{
  record('installed',{regions:regions(),surfaces:surfaces()});
  mutationObserver=new MutationObserver(safe(records=>mutations(records)));mutationObserver.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','open','aria-modal']});
  for(const type of ['beforetoggle','toggle'])listen(document,type,event=>record(type,{role:role(event.target),oldState:['open','closed'].includes(event.oldState)?event.oldState:'unknown',newState:['open','closed'].includes(event.newState)?event.newState:'unknown',trusted:event.isTrusted===true,surfaces:surfaces()}));
  for(const type of ['focusin','pointerdown'])listen(document,type,event=>{
   // Event capture may run synchronously before the pending mutation callback.
   // Classify current focus without consuming that callback's previous roots.
   const unique=name=>{const nodes=document.querySelectorAll(selectors[name]);return nodes.length===1?nodes[0]:null;};
   const target=event.target,category=unique('composer')?.contains(target)?'protected-composer':unique('header')?.contains(target)?'protected-header':role(target?.closest?.('section[data-va-owned][popover="manual"]'))!=='other'?'owned-surface':target?.closest?.('dialog,[popover]')?'native-layer':'other';record(type,{category,trusted:event.isTrusted===true,surfaces:surfaces()});
  });
  listen(document,'visibilitychange',()=>record('visibility',{visible:document.visibilityState==='visible'}));
  listen(globalThis,'pagehide',()=>{issues.add('document-left');record('pagehide');finish();});
  listen(globalThis,'popstate',()=>record('popstate'));
  resourceObserver=new PerformanceObserver(safe(list=>resources(list.getEntries())));resourceObserver.observe({type:'resource',buffered:true});
 }catch{issues.add('installation-error');}
}
