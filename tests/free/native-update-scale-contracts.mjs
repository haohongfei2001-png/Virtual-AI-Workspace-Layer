/** Real DOM + synthetic owner observations. Explicit read-only refresh, not live upstream delivery. */
export async function runNativeUpdateScale(page){
 const check=(condition,message)=>{if(!condition)throw Error(message);},results=[];
 const target=await page.evaluate(()=>({id:'c'+(sendScale.size-1),url:location.origin+'/hf/A/c/c'+(sendScale.size-1)}));
 // One synthetic host metadata row makes the actual host route renderable;
 // this does not copy a chat or grant any native/source authority.
 await page.evaluate(async({id,url})=>{const facts=(await sendScale.service.native.page(sendScale.scope,{ids:{projects:[],refs:[id]}})).facts,r=facts.refs[id],membership=facts.membership[id];if(!r)throw Error('missing-tail-native-fact');if(!HF.data().refs.some(row=>row.id===id))HF.data().refs.push({id,scope:'A',nativeTitle:r.nativeTitle,nativeUrl:url,projectId:membership?.state==='PROJECT'?membership.projectId:null,available:true});HF.navigate(url);},target);
 await page.waitForFunction(id=>sendScale.client.status().state==='ACTIVE'&&sendScale.client.navigation.currentRef()?.id===id,target.id,{timeout:30000});
 await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('原生更新测试中未发送的草稿');
 await page.evaluate(()=>{sendScale.nativeUpdateComposer=HF.getView().input;});
 const scenarios=[
  {name:'native-title-project',membership:'PROJECT',title:'原生尾部标题更新',projectName:null},
  {name:'project-to-none',membership:'NONE',title:'原生尾部标题更新',projectName:null},
  {name:'none-to-unknown',membership:'UNKNOWN',title:'原生尾部标题更新',projectName:null},
  {name:'unknown-to-project-and-names',membership:'PROJECT',title:'最终原生聊天标题',projectName:'最终原生项目名称'},
  {name:'unavailable-known-reference',membership:'UNKNOWN',title:'最终原生聊天标题',projectName:null,unavailable:true},
  {name:'available-restored',membership:'PROJECT',title:'重新可用原生聊天',projectName:'最终原生项目名称'},
 ];
 for(const scenario of scenarios){
  await page.evaluate(async({scenario,id})=>{
   const t=sendScale,{FIXTURE_NOW}=await import('/simulator/data.mjs');
   const header=await t.service.native.header(t.scope),facts=(await t.service.native.page(t.scope,{ids:{projects:['P1'],refs:[id]}})).facts;
   const old=facts.refs[id],project=facts.projects.P1,source=facts.sources[old.sourceId];if(!old||!project||!source)throw Error('missing-update-fixture');
   const nextSourceRevision=source.sourceRevision+1,projectId=scenario.membership==='PROJECT'?'P1':null;
   const batch={scopeKey:facts.scopeKey,sourceRevision:nextSourceRevision,observedAt:FIXTURE_NOW,validUntil:source.validUntil,inventory:source.inventory,
    projects:scenario.membership==='PROJECT'?[{id:'P1',nativeName:scenario.projectName??project.nativeName,nativeUrl:project.nativeUrl,availability:'available'}]:[],
    refs:[{id,nativeTitle:scenario.title,nativeUrl:old.nativeUrl,availability:scenario.unavailable?'unavailable':'available'}],membership:[{id,state:scenario.membership,projectId}]};
   const result=await t.service.native.apply(t.scope,{operationId:'scale_update_'+scenario.name,expectedRevision:header.revision,batch});if(!result.ok)throw Error('native-update:'+result.reason);
   t.nativeUpdate={scenario,id,committedAt:performance.now(),beforeCounts:{...t.counts},traceStart:t.trace.length,revision:result.revision};
   // Keep the refresh promise owner-visible; it performs no host send or upstream observation.
   t.nativeUpdate.refresh=t.client.refresh();
  },{scenario,id:target.id});
  await page.waitForFunction(({id,scenario})=>{
   const t=sendScale;if(t.client.status().state!=='ACTIVE')return false;
   const ref=t.client.navigation.currentRef();
   if(scenario.unavailable)return true;
   const roots=t.client.navigation.roots(),row=roots?.sidebar.shadow.querySelector('[data-ref-id="'+id+'"]');
   return ref?.id===id&&ref.membership===scenario.membership&&ref.nativeTitle===scenario.title&&row?.textContent.includes(scenario.title)&&(!scenario.projectName||roots.sidebar.shadow.textContent.includes(scenario.projectName));
  },{id:target.id,scenario},{timeout:30000});
  const result=await page.evaluate(async()=>{
   const t=sendScale,u=t.nativeUpdate,observedAt=performance.now();await u.refresh;
   const ref=t.client.navigation.currentRef(),roots=t.client.navigation.roots(),domReachable=!!roots?.sidebar.shadow.querySelector('[data-ref-id="'+u.id+'"]');
   const counts=Object.fromEntries(Object.keys(t.counts).map(k=>[k,t.counts[k]-u.beforeCounts[k]]));
   const native=(await t.service.native.page(t.scope,{ids:{projects:[],refs:[u.id]}})).facts.refs[u.id];
   const shared=await t.service.workspaces.partitioned.partialContext(t.scope,[u.id],{boundedDirectory:true});
   return {name:u.scenario.name,id:u.id,commitToDOMMs:observedAt-u.committedAt,timingTargetMs:1000,timingStatus:observedAt-u.committedAt<=1000?'PASS':'FAIL',trigger:'explicit-client.refresh-after-synthetic-owner-commit',upstreamNotification:'NOT_TESTED',revision:u.revision,
    availability:native?.availability,omittedTombstone:t.trace.slice(u.traceStart).some(r=>r.omittedRefs?.includes(u.id)),cachedTitleVisible:!!roots?.sidebar.shadow.textContent.includes(u.scenario.title),currentRef:ref?{id:ref.id,membership:ref.membership,nativeTitle:ref.nativeTitle}:null,domReachable,knownPersisted:!!shared?.state.refs[u.id],draftPreserved:HF.getView().input===t.nativeUpdateComposer&&HF.getView().input.value==='原生更新测试中未发送的草稿',counts,rpc:t.trace.slice(u.traceStart)};
  });
  check(result.draftPreserved,'native update replaced composer or lost unsent draft');check(result.knownPersisted,'native update lost shared known identity');
  for(const [name,count]of Object.entries(result.counts))if(name.endsWith('.read')||name.endsWith('.snapshot'))check(count===0,'unexpected full read: '+name);
  if(scenario.unavailable){check(!result.currentRef&&!result.domReachable&&!result.cachedTitleVisible,'unavailable native private metadata remained visible');check(result.availability==='unavailable'&&result.omittedTombstone,'unavailable owner fact/tombstone missing: '+JSON.stringify(result));result.reachabilityStatus='PASS';result.reachabilityRequirement='Unavailable fact retained privately; cached title hidden and omitted tombstone emitted';}
  else{check(result.currentRef?.id===target.id&&result.currentRef.membership===scenario.membership&&result.domReachable,'native update did not reach current UI');result.reachabilityStatus='PASS';}
  results.push(result);
 }
 return {evidence:'REAL_BROWSER_SYNTHETIC_NATIVE_UPDATE_WITH_EXPLICIT_REFRESH',realChatGPT:'NOT_RUN',hostFixture:'one synthetic native metadata row added for the tail host route; no copied messages',tail:target.id,results};
}
