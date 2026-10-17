const failure=code=>Error('background-auxiliary-'+code);
/** Creates one background target in the existing isolated default context.
 * No fallback page, focus activation, or mutation of an existing page. */
export async function createBackgroundAuxiliaryPage({context,cdp,url}){
 if(typeof url!=='string'||typeof context?.pages!=='function'||typeof context?.newCDPSession!=='function'||typeof cdp?.send!=='function')throw failure('invalid-input');
 const deadline=Date.now()+5000;let targetId,complete=false;
 const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('timeout')),Math.max(0,deadline-Date.now()));})]);}finally{clearTimeout(timer);}};
 const closeTarget=async id=>{let timer;try{await Promise.race([cdp.send('Target.closeTarget',{targetId:id}),new Promise(resolve=>{timer=setTimeout(resolve,Math.min(250,Math.max(0,deadline-Date.now())));})]);}catch{}finally{clearTimeout(timer);}};
 const sessions=new Set();
 try{
  // A late create reply still owns a target and must clean it up after timeout.
  let abandoned=false;const creation=cdp.send('Target.createTarget',{url:'about:blank',background:true});
  creation.then(result=>{if(abandoned&&typeof result?.targetId==='string')void closeTarget(result.targetId);},()=>{});
  let created;try{created=await bounded(creation);}catch(error){abandoned=true;throw error;}
  if(typeof created?.targetId!=='string'||!created.targetId)throw failure('invalid-target');targetId=created.targetId;
  const seen=new Set();let page;
  while(!page){
   if(Date.now()>=deadline)throw failure('timeout');
   for(const candidate of context.pages()){
    if(seen.has(candidate)||candidate.isClosed())continue;seen.add(candidate);
    let session;
    try{
     const connecting=context.newCDPSession(candidate);let expired=false;
     connecting.then(value=>{if(expired)void value.detach().catch(()=>{});},()=>{});
     try{session=await bounded(connecting);}catch(error){expired=true;throw error;}
     sessions.add(session);const result=await bounded(session.send('Target.getTargetInfo'));
     if(result?.targetInfo?.targetId===targetId){page=candidate;break;}
    }finally{if(session){await bounded(session.detach());sessions.delete(session);}}
   }
   if(!page)await bounded(new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(0,deadline-Date.now())))));
  }
  await bounded(page.goto(url,{timeout:Math.max(1,deadline-Date.now())}));
  if(page.isClosed())throw failure('page-closed');complete=true;return page;
 }finally{
  for(const session of sessions)try{void session.detach().catch(()=>{});}catch{}
  if(!complete&&targetId)await closeTarget(targetId);
 }
}
