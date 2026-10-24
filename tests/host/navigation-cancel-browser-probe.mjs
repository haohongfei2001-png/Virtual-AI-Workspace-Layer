import assert from 'node:assert/strict';
// Entry precondition for this cancellation experiment, not an authorization.
// Re-resolve the exact locator; later currentLink/owner checks remain decisive.
export function readyDelegatedControl(nodes){return nodes.length===1&&nodes[0].ownerDocument===document&&nodes[0].isConnected===true&&nodes[0].hasAttribute('data-native-plan-control')&&nodes[0].getAttribute('aria-disabled')!=='true';}
/** Offline fixture only: hold one already-completed authorization response. */
export async function probeNavigationCancellation({context,page,workspace,result,extensionId,trace,title,intent='query',draft='preserved search draft',dispatchType='HOST_UI_DISPATCH_CURRENT',diagnostics={}}){
 const cdp=await context.newCDPSession(page),worlds=[];
 cdp.on('Runtime.executionContextCreated',event=>worlds.push(event.context));await cdp.send('Runtime.enable');
 const {frameTree}=await cdp.send('Page.getFrameTree');const matches=worlds.filter(w=>w.origin==='chrome-extension://'+extensionId&&w.auxData?.frameId===frameTree.frame.id&&w.auxData?.isDefault===false);assert.equal(matches.length,1);
 const evaluate=async expression=>{const response=await cdp.send('Runtime.evaluate',{contextId:matches[0].id,returnByValue:true,expression});if(response.exceptionDetails)throw Error('cancel-probe-evaluation-failed');return response.result.value;};
 const origin=new URL(page.url()).origin;assert.equal(new URL(origin).hostname,'127.0.0.1');
 const start=trace.length,url=page.url(),pages=context.pages().length;
 await evaluate(`(()=>{if(location.origin!==${JSON.stringify(origin)})throw Error('offline-origin-required');const send=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.cancelProbe={count:0,held:false,released:false,replyOK:false};chrome.runtime.sendMessage=function(...args){const pending=send(...args);if(args[0]?.type!=='HOST_NATIVE_AUTHORIZE')return pending;const key=JSON.stringify(args[0].command);if(!cancelProbe.key)cancelProbe.key=key;if(key!==cancelProbe.key)return pending;const n=++cancelProbe.count;if(n!==2)return pending;return pending.then(reply=>new Promise(resolve=>{cancelProbe.actionId=args[0].command?.actionId;cancelProbe.targetKey=args[0].command?.targetKey;cancelProbe.held=true;cancelProbe.replyOK=reply?.ok===true;cancelProbe.release=()=>{cancelProbe.released=true;resolve(reply);};}));};})()`);
 const until=Date.now()+6000;const remaining=()=>{const ms=until-Date.now();assert(ms>0,'original six-second window');return ms;};
 const wait=async check=>{while(Date.now()<until){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('cancel-probe-original-six-second-window');};
 try{
  diagnostics.phase='control-ready';await wait(()=>result.evaluateAll(readyDelegatedControl));
  diagnostics.phase='single-click';await result.click({timeout:remaining()});diagnostics.phase='authorization-hold';await wait(()=>evaluate('cancelProbe.held'));
  assert.equal(await evaluate('cancelProbe.replyOK'),true,'hold a successful real authorization, not a synthetic reply');
  diagnostics.phase='new-intent';
  const search=workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true});
  if(intent==='return')await page.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:remaining()});else {await search.fill(title+' cancellation',{timeout:remaining()});if(intent==='panel'){await workspace.getByRole('button',{name:'工作空间设置',exact:true}).click({timeout:remaining()});await workspace.getByRole('button',{name:'备份与导入',exact:true}).click({timeout:remaining()});await workspace.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:remaining()});}}
  diagnostics.phase='cancel-ack';await wait(()=>trace.slice(start).some(e=>e.type==='HOST_UI_CANCEL_NAVIGATION'&&e.ok===true&&e.state==='cancelled'));
  await evaluate('cancelProbe.release()');
  diagnostics.phase='late-dispatch';
  await wait(()=>trace.slice(start).some(e=>e.type===dispatchType));
  const dispatch=trace.slice(start).filter(e=>e.type===dispatchType);assert.equal(dispatch.length,1);assert.notEqual(dispatch[0].state,dispatchType==='HOST_UI_DISPATCH_CURRENT'?'already-current':'dispatched');
  const cancellations=trace.slice(start).filter(e=>e.type==='HOST_UI_CANCEL_NAVIGATION');assert.equal(cancellations.length,1);
  const held=await evaluate('({actionId:cancelProbe.actionId,targetKey:cancelProbe.targetKey})');assert.equal(typeof held.actionId,'string');assert.equal(typeof held.targetKey,'string');for(const entry of [dispatch[0],cancellations[0]]){assert.equal(entry.actionId,held.actionId);assert.equal(entry.targetKey,held.targetKey);}
  assert.equal(page.url(),url);assert.equal(context.pages().length,pages);assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),0);
  if(intent!=='return'){assert.equal(await search.inputValue({timeout:remaining()}),title+' cancellation');assert.equal(await search.isVisible(),true,'latest workspace search stays visibly available');if(intent==='panel')await wait(()=>workspace.locator('.workspace').evaluate(node=>node.getRootNode().activeElement===node));}else assert.equal(await workspace.locator('.workspace').isVisible(),true,'returned workspace stays visible');
  assert(await page.evaluate(value=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value===value,draft));
  assert(Date.now()<until,'complete cancellation observation must fit original six seconds');
  diagnostics.phase='complete';
  return {state:'PASS',realAuthorizationHeld:true,cancelAcknowledged:true,lateReplyDidNotEnterReading:true,originalDocumentEditorDraft:true,oneDispatch:true,oneCancellation:true,elapsedMs:6000-(until-Date.now()),scope:intent==='return'?'OFFLINE_MV3_NATIVE_RETURN_SUBCHAIN_ONLY':intent==='panel'?'OFFLINE_MV3_PENDING_PANEL_RETURN_SUBCHAIN_ONLY':'OFFLINE_MV3_SAME_TARGET_SUBCHAIN_ONLY'};
 }finally{diagnostics.probe=await evaluate('(()=>{const value={count:cancelProbe.count,held:cancelProbe.held,released:cancelProbe.released,replyOK:cancelProbe.replyOK};if(cancelProbe.held&&!cancelProbe.released)cancelProbe.release();return value;})()').catch(()=>({unavailable:true}));await cdp.detach();}
}
