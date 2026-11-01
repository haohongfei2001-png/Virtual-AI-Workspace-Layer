/** Diagnostic-only passive existing-world snapshot. One deadline covers all work. */
export async function collectJ4ContentLifecycle({context,page,extensionId,worker=null,timeoutMs=1500}={}){
 if(!context||!page||typeof extensionId!=='string'||!/^[a-p]{32}$/.test(extensionId)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>1500)return {unavailable:true};
 let session,closed=false,timer;const contexts=[];let contentResult={unavailable:true};
 const created=({context:value})=>{if(contexts.length<64)contexts.push(value);};
 const detach=value=>{try{value.off('Runtime.executionContextCreated',created);Promise.resolve(value.detach()).catch(()=>{});}catch{}};
 const origin='chrome-extension://'+extensionId;
 const acquire=Promise.resolve().then(()=>context.newCDPSession(page));
 acquire.then(value=>{if(closed)detach(value);},()=>{});
 const work=(async()=>{
  session=await acquire;if(closed)return {unavailable:true};session.on('Runtime.executionContextCreated',created);
  await session.send('Runtime.enable');if(closed)return {unavailable:true};
  const tree=await session.send('Page.getFrameTree');if(closed)return {unavailable:true};
  const top=tree.frameTree?.frame?.id;
  const matches=contexts.filter(c=>typeof top==='string'&&c.auxData?.frameId===top&&c.auxData?.isDefault===false&&(c.origin===origin||c.name===origin)&&Number.isSafeInteger(c.id)&&c.id>0);
  if(matches.length<1||matches.length>4)return contentResult={unavailable:true,matchingContexts:matches.length};
  async function readContext(contextId){try{
  const result=await session.send('Runtime.evaluate',{contextId,expression:'globalThis.__vaiwlJ4ContentLifecycle ?? null',returnByValue:true});
  if(result.exceptionDetails)return {unavailable:true};
  const trace=result.result?.value;
  if(!trace||Array.isArray(trace)||!Array.isArray(trace.rows)||trace.rows.length>192||Object.keys(trace.rows).length!==trace.rows.length||!Number.isSafeInteger(trace.sequence)||!Number.isSafeInteger(trace.dropped))return {unavailable:true};
  const stages=['delivery-pending','delivery-ready','delivery-invalidated','stop','rebind','context-pending','context-ready','begin','auth-verified','mount-ready'];
  const booleans=['enabled','ready','scopePresent','readyPending','resumeAllowed','active','associationPending'],numbers=['run','epoch','routeEpoch'],keys=['stage','sequence','document',...booleans,...numbers].sort();
  if(Object.keys(trace).sort().join()!=='dropped,rows,sequence'||trace.dropped<0||trace.sequence!==trace.dropped+trace.rows.length||trace.rows.some((r,i)=>!r||Array.isArray(r)||!Number.isSafeInteger(r.sequence)||Object.keys(r).sort().join()!==keys.join()||!stages.includes(r.stage)||r.sequence!==trace.dropped+i+1||booleans.some(k=>typeof r[k]!=='boolean')||numbers.some(k=>r[k]!==null&&(!Number.isSafeInteger(r[k])||r[k]<0))||r.document!==null&&!(typeof r.document==='string'&&/^[0-9a-f]{8}$/.test(r.document))))return {unavailable:true};
  // Return only checked fields, never the unfiltered CDP object.
  return {trace:{sequence:trace.sequence,dropped:trace.dropped,rows:trace.rows.map(row=>Object.fromEntries(keys.map(key=>[key,row[key]])))}};
  }catch{return {unavailable:true};}}
  if(matches.length===1){const content=await readContext(matches[0].id);if(!closed)contentResult=content;return contentResult;}
  // Preserve separate realm sequences. This does not select a current owner.
  const rows=matches.map(c=>({contextId:c.id,content:{unavailable:true}}));
  contentResult={ambiguous:true,contexts:rows};
  await Promise.all(rows.map(async row=>{const content=await readContext(row.contextId);if(!closed)row.content=content;}));
  return contentResult;
 })();
 // Optional existing worker is read concurrently inside the same deadline.
 let workerResult={unavailable:true};
 const workerWork=worker?Promise.resolve().then(()=>worker.evaluate(()=>globalThis.__vaiwlJ4LifecycleOrder??null)).then(rows=>{workerResult={rows};},()=>{}):Promise.resolve();
 try{return await Promise.race([Promise.all([work,workerWork]).then(([content])=>({content,worker:workerResult})),new Promise(resolve=>{timer=setTimeout(()=>resolve({content:contentResult,worker:workerResult,timedOut:true}),timeoutMs);})]);}
 catch{return {content:contentResult,worker:workerResult};}
 finally{closed=true;clearTimeout(timer);if(session)detach(session);}
}
