/** Two same-origin real IDB connections and independent fixture brokers. No broadcast claim. */
export async function runMultitabScale(page){
 const check=(value,message)=>{if(!value)throw Error(message);};let second;
 const before=await page.evaluate(async()=>{const t=sendScale,h=await t.service.native.header(t.scope);if(Object.keys(h.manifest.refs).length>=100000)throw Error('multitab fixture needs one reserved native reference slot');const {scopeOf}=await import('/simulator/data.mjs');const other=await t.service.native.header(scopeOf('B'));return {count:Object.keys(h.manifest.refs).length,scope:h.scopeKey??t.scope,otherRevision:other.revision,otherRefs:Object.keys(other.manifest?.refs??{}).length,url:location.href,current:t.client.navigation.currentRef()?.id};});
 check(before.otherRevision===0&&before.otherRefs===0,'other account fixture must start empty');
 await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('标签A仍未发送的草稿');
 await page.evaluate(()=>{sendScale.multitabOriginalInput=HF.getView().input;});
 try{
  second=await page.context().newPage();await second.goto(new URL('/hf/A/c/T0?mode=native',before.url).href);await second.bringToFront();
  await second.evaluate(async()=>{
   const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf}=await import('/simulator/data.mjs');
   const scope=scopeOf('A'),id='multitab_scale',documentId='multitab_scale_second',trace=[],counts={};
   const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:location.href})});
   // Read the same persisted database before client startup. Never seed or initialize.
   const persisted=await service.native.header(scope);
   for(const [label,repo]of [['native',service.native],['evidence',service.evidence],['workspace',service.workspaces]])for(const method of ['read','snapshot','page','header'])if(typeof repo[method]==='function'){const original=repo[method].bind(repo);counts[label+'.'+method]=0;repo[method]=async(...args)=>{counts[label+'.'+method]++;return original(...args);};}
   const events=[];document.addEventListener('hf:synthetic-send',event=>events.push({...event.detail,at:performance.now()}));
   const client=startClient({subscribe:listener=>service.subscribe(listener),send:async message=>{const start=performance.now(),reply=await service.broker.handle(message,{id,tab:{id:2},frameId:0,documentId,documentLifecycle:'active',url:location.href});trace.push({type:message.type,start,at:performance.now(),ok:reply.ok,reason:reply.reason});return reply;},invalidateRemote:()=>service.broker.invalidate({tabId:2}),readControls:()=>HF.state});
   globalThis.multitabScale={service,client,scope,trace,counts,events,initialCount:Object.keys(persisted.manifest.refs).length,startedAt:performance.now()};
  });
  await second.waitForFunction(()=>multitabScale.client.status().state==='ACTIVE',null,{timeout:30000});
  const loaded=await second.evaluate(()=>({count:multitabScale.initialCount,elapsedMs:performance.now()-multitabScale.startedAt}));check(loaded.count===before.count,'second tab did not load same persisted inventory');
  await second.getByRole('link',{name:'新聊天',exact:true}).click();await second.waitForFunction(()=>multitabScale.client.status().state==='ACTIVE',null,{timeout:30000});
  await second.getByRole('textbox',{name:'消息输入',exact:true}).fill('第二标签实际合成发送');await second.evaluate(()=>{multitabScale.beforeSend={...multitabScale.counts};});await second.getByRole('button',{name:'发送消息',exact:true}).click();
  await second.waitForFunction(()=>{const t=multitabScale,e=t.events.at(-1),r=t.client.navigation.currentRef();return e&&r?.id===e.conversationId&&r.membership==='NONE'&&(r.activityDecision??r.activity)?.segment===0&&t.trace.some(x=>x.type==='B23_SYNTHETIC_SEND'&&x.start>=e.at&&x.ok);},null,{timeout:6500});
  const sent=await second.evaluate(()=>{const t=multitabScale,e=t.events.at(-1);return {id:e.conversationId,messageId:e.messageId,eventToDOMMs:performance.now()-e.at,events:t.events.length,counts:Object.fromEntries(Object.keys(t.counts).map(k=>[k,t.counts[k]-t.beforeSend[k]])),rpc:t.trace.filter(x=>x.start>=e.at)};});check(sent.events===1,'second tab duplicated user event');
  await page.bringToFront();
  await page.evaluate(()=>{const t=sendScale;t.multitabRefresh={start:performance.now(),counts:{...t.counts},traceStart:t.trace.length};t.multitabRefresh.promise=t.client.refresh();});
  await page.waitForFunction(id=>sendScale.client.status().state==='ACTIVE'&&!!sendScale.client.navigation.roots()?.sidebar.shadow.querySelector('[data-ref-id="'+id+'"]'),sent.id,{timeout:30000});
  const observed=await page.evaluate(async({id,messageId})=>{
   const t=sendScale,u=t.multitabRefresh,at=performance.now();await u.promise;
   const counts=Object.fromEntries(Object.keys(t.counts).map(k=>[k,t.counts[k]-u.counts[k]])),rpc=t.trace.slice(u.traceStart),r=t.client.navigation.currentRef();
   const native=(await t.service.native.page(t.scope,{ids:{projects:[],refs:[id]}})).facts,shared=await t.service.workspaces.partitioned.partialContext(t.scope,[id],{boundedDirectory:true}),{scopeOf}=await import('/simulator/data.mjs'),other=await t.service.native.header(scopeOf('B'));
   return {refreshToDOMMs:at-u.start,current:r?.id,url:location.href,reading:t.client.navigation.view().mode==='reading',draftPreserved:HF.getView().input===t.multitabOriginalInput&&HF.getView().input.value==='标签A仍未发送的草稿',newRefPersisted:!!native.refs[id],newMembership:native.membership[id]?.state,storedEvents:Object.values(shared.state.events).filter(row=>row.messageId===messageId).length,otherRevision:other.revision,otherRefs:Object.keys(other.manifest?.refs??{}).length,counts,rpc};
  },sent);
  check(observed.url===before.url&&observed.current===before.current&&observed.reading,'second tab update changed first tab reading route');check(observed.draftPreserved,'first tab draft/input node lost');check(observed.newRefPersisted&&observed.newMembership==='NONE'&&observed.storedEvents===1,'cross-tab committed data missing or duplicated');check(observed.otherRevision===0&&observed.otherRefs===0,'other account native inventory changed');
  for(const record of [sent,observed])for(const [key,count]of Object.entries(record.counts))if(key.endsWith('.read')||key.endsWith('.snapshot'))check(count===0,'unexpected full read '+key);
  return {evidence:'REAL_BROWSER_SYNTHETIC_MULTITAB_SHARED_ORIGIN_IDB',realChatGPT:'NOT_RUN',broadcast:'NOT_TESTED',crossDevice:'NOT_TESTED',refreshTrigger:'explicit first-tab client.refresh after headless activation',secondTabInitial:loaded,secondTabSend:{...sent,timingTargetMs:1000,timingStatus:sent.eventToDOMMs<=1000?'PASS':'FAIL'},firstTabRefresh:{...observed,timingTargetMs:1000,timingStatus:observed.refreshToDOMMs<=1000?'PASS':'FAIL'},scopeSeparation:'other-account native metadata revision unchanged; no other-account client seeded'};
 }finally{if(second&&!second.isClosed()){await second.evaluate(()=>{globalThis.multitabScale?.client.stop();globalThis.multitabScale?.service.close();}).catch(()=>{});await second.close();}await page.bringToFront();}
}
