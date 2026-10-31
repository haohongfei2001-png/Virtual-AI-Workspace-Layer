import {PROBE_KEY,PROBE_PREFIX} from './native-me-probe-config.mjs';
const key=PROBE_KEY,status=document.getElementById('result'),button=document.getElementById('run');
let view=0,busy=false;
const show=(value,epoch=view)=>{if(epoch===view)status.textContent=JSON.stringify(value);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v,max=1000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const bool=v=>typeof v==='boolean';
const oneOf=(...values)=>v=>values.includes(v);
const nullable=check=>v=>v===null||check(v);
const shape=(v,fields,optional=[])=>record(v)&&Object.keys(v).every(k=>Object.hasOwn(fields,k))&&Object.entries(fields).every(([k,check])=>Object.hasOwn(v,k)?check(v[k]):optional.includes(k));
const schemaIssues=['root-object','accounts-object','accounts-limit','entry-key','entry-object','account-object','default-null-context-id','account-id','account-structure','deactivated-flag','session-access-flag','nondefault-alias','default-canonical-missing','default-entry-uncomparable','default-entry-mismatch','duplicate-account'];
const commonReasons=['transport-failed','request-timeout','document-changed','invalid-session-response','session-challenged','session-unauthorized','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json'];
const categories=['null','array','undefined','string','boolean','number','object','missing','empty','too-long','whitespace-control','reserved','valid-string','equal','different','incomparable','personal','workspace','team','other-string','true','false'];
const histogram=v=>record(v)&&Object.entries(v).every(([k,n])=>categories.includes(k)&&integer(n));
const group=v=>shape(v,{entries:integer,keyFormat:histogram,entryType:histogram,accountType:histogram,account_id:histogram,id:histogram,keyEqualsAccountId:histogram,keyEqualsId:histogram,fieldsEqual:histogram,structure:histogram,isDeactivated:histogram,sessionAccess:histogram,duplicateAccountIds:integer,duplicateIds:integer});
const alias=v=>shape(v,{relation:oneOf('incomparable','canonical-missing')})||shape(v,{relation:oneOf('canonical-present'),canonicalType:oneOf(...categories),sameKey:bool,wholeEntryEqual:oneOf('equal','different','uncomparable')});
const structure=nullable(v=>shape(v,{rootType:oneOf(...categories),accountsType:oneOf(...categories),entryCount:nullable(n=>integer(n,1000000)),overLimit:bool,groups:g=>shape(g,{default:group,ordinary:group}),defaultAlias:nullable(a=>shape(a,{account_id:alias,id:alias}))}));
const httpStatus=nullable(v=>Number.isInteger(v)&&v>=100&&v<=599);
const meta=nullable(v=>shape(v,{status:httpStatus,jsonMime:bool,challenge:bool,redirected:bool,denied:oneOf(true),idValid:bool,structure,selectedFieldSchemaValid:bool,contextCount:integer,unknownKindCount:integer,schemaIssue:oneOf(...schemaIssues)},['denied','idValid','structure','selectedFieldSchemaValid','contextCount','unknownKindCount','schemaIssue']));
// Results are diagnostic categories, never an identity or a source receipt.
// Re-validate even our own receiver before displaying or persisting anything.
function terminal(value){
 try{
  let valid=false;
  if(PROBE_PREFIX==='VAIWL_CREDENTIAL_CONTROL')valid=shape(value,{state:oneOf('finished'),stage:oneOf('before-request','meInclude','meOmit','accountsInclude','accountsOmit'),requests:n=>integer(n,4),meInclude:meta,meOmit:meta,meRelation:oneOf('not-compared','not-comparable','same','different'),accountsInclude:meta,accountsOmit:meta,accountsRelation:oneOf('not-compared','not-comparable','same','different'),credentialDependence:oneOf('not-established','inconclusive','include-id-omit-denied'),identityEnabled:oneOf(false),reason:oneOf(...commonReasons,'rate-limited','invalid-me-schema','same-id-without-credentials','accounts-limit','control-complete-not-authorized')});
  else if(PROBE_PREFIX==='VAIWL_ME_CANDIDATE')valid=shape(value,{state:oneOf('finished'),stage:oneOf('before-me','accounts','after-me'),requests:n=>integer(n,3),status:httpStatus,jsonMime:bool,redirected:bool,challenge:bool,firstIdValid:bool,lastIdValid:bool,samePrincipal:bool,rosterValid:bool,contextCount:nullable(integer),unknownKindCount:nullable(integer),schemaIssue:nullable(oneOf(...schemaIssues)),sourceExpiryKnown:oneOf(false),localFreshnessMaxMs:oneOf(60000),identityEnabled:oneOf(false),reason:oneOf(...commonReasons,'invalid-me-schema','invalid-accounts-schema','principal-changed','candidate-consistent-not-authorized')});
  else if(PROBE_PREFIX==='VAIWL_ACCOUNTS_SCHEMA'||PROBE_PREFIX==='VAIWL_ACCOUNTS_STRUCTURE')valid=shape(value,{state:oneOf('finished'),reason:oneOf(...commonReasons,'accounts-schema-valid-not-authorized',...schemaIssues.map(s=>'accounts-schema:'+s)),...(PROBE_PREFIX==='VAIWL_ACCOUNTS_STRUCTURE'?{structure}:{})});
  else if(PROBE_PREFIX==='VAIWL_ME_PROBE')valid=shape(value,{state:oneOf('finished'),status:httpStatus,jsonMime:bool,redirected:bool,challenge:bool,idValid:bool,reason:oneOf(...commonReasons,'valid-id-structure','invalid-id-structure')});
  if(!valid)return null;
  const text=JSON.stringify(value);return text.length<=16384?JSON.parse(text):null;
 }catch{return null;}
}
function marker(){
 const raw=localStorage.getItem(key);let value=null;
 if(raw!==null&&raw.length<=32768)try{value=JSON.parse(raw);}catch{}
 return {raw,value:record(value)?value:null};
}
function saved(m){return m.raw!==null&&m.value?.result?terminal(m.value.result):null;}
function bound(m){return Number.isSafeInteger(m.value?.tabId)&&m.value.tabId>=0&&typeof m.value.documentKey==='string'&&m.value.documentKey.length>0&&m.value.documentKey.length<=256;}
function receive(value,original,epoch){
 const current=marker(),existing=saved(current);if(existing){show(existing,epoch);return;}
 if(current.raw!==original){show({state:'result-unavailable-no-retry'},epoch);return;}
 const result=terminal(value);
 if(!result){show({state:['no-result','document-changed-no-retry'].includes(value?.state)?value.state:'result-rejected-no-retry'},epoch);return;}
 try{localStorage.setItem(key,JSON.stringify({...current.value,result}));}
 catch{show({state:'result-received-storage-unavailable-no-retry',result},epoch);return;}
 show(result,epoch);
}
async function bounded(operation,ms){
 if(ms<=0)throw Error('diagnostic-timeout');
 const end=performance.now()+ms;let timer;
 try{const value=await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('diagnostic-timeout')),ms);})]);if(performance.now()>=end)throw Error('diagnostic-timeout');return value;}finally{clearTimeout(timer);}
}
function updateButton(){try{button.disabled=busy||marker().raw!==null;}catch{button.disabled=true;show({state:'local-state-unavailable-no-request'});}}
// Keep the same durable marker, including the legacy 'consumed' value. Opening
// another popup or selecting another home must never renew the one request.
updateButton();
try{const m=marker();if(m.raw!==null)show(saved(m)??{state:'already-consumed-no-retry'});}catch{}
button.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;button.disabled=true;const epoch=++view;let phase='lock',entered=false;
 const lock=new AbortController(),lockDeadline=performance.now()+2000,timer=setTimeout(()=>lock.abort(),2000);
 try{await navigator.locks.request(key,{signal:lock.signal},async()=>{
  if(lock.signal.aborted)return;
  if(performance.now()>=lockDeadline)throw Error('diagnostic-timeout');
  entered=true;clearTimeout(timer);
  if(marker().raw!==null){show(saved(marker())??{state:'already-consumed-no-retry'},epoch);return;}
  const deadline=performance.now()+3000;
  const preflight=async operation=>{const result=await bounded(operation,deadline-performance.now());if(epoch!==view)throw Error('diagnostic-retired');return result;};
  phase='select-home';
  const tabs=await preflight(()=>chrome.tabs.query({active:true,currentWindow:true})),tab=tabs.length===1?tabs[0]:null;
  if(!Number.isSafeInteger(tab?.id)||tab.id<0||tab.url!=='https://chatgpt.com/'){
   show({state:'select-chatgpt-home-no-request',help:'请切到专用 Profile 的 ChatGPT 空白首页，再打开这个诊断入口。'});return;
  }
  phase='receiver';
  const ready=await preflight(()=>chrome.tabs.sendMessage(tab.id,{type:PROBE_PREFIX+'_READY'},{frameId:0}));
  const requiredVersion=PROBE_PREFIX==='VAIWL_CREDENTIAL_CONTROL'?5:PROBE_PREFIX==='VAIWL_ACCOUNTS_STRUCTURE'?4:PROBE_PREFIX==='VAIWL_ACCOUNTS_SCHEMA'?3:PROBE_PREFIX==='VAIWL_ME_CANDIDATE'?2:null;
  if(requiredVersion!==null&&ready!=null&&ready.receiverVersion!==requiredVersion){show({state:'receiver-version-reload-required-no-request',help:'诊断页面与已加载接收器版本不同；请重新加载同一个 VAIWL 扩展后打开新的 ChatGPT 首页。本次未发请求。'});return;}
  if(ready?.ready===true&&ready.spent===false&&ready.statusDocumentBound!==true){show({state:'receiver-protocol-reload-required-no-request',help:'当前接收器不支持按原文档恢复结果；本次未发请求。需在一次正常扩展更新后再执行，不能反复尝试。'});return;}
  if(ready?.ready!==true||ready.spent!==false||typeof ready.documentKey!=='string'||!ready.documentKey.length||ready.documentKey.length>256){
   let legacyReceiverPresent=false;
   if(ready==null&&PROBE_PREFIX==='VAIWL_ME_CANDIDATE'){
    // Compatibility diagnosis only. Never invoke the consumed legacy probe.
    try{const legacy=await preflight(()=>chrome.tabs.sendMessage(tab.id,{type:'VAIWL_ME_PROBE_READY'},{frameId:0}));legacyReceiverPresent=typeof legacy?.documentKey==='string'&&typeof legacy?.ready==='boolean'&&typeof legacy?.spent==='boolean';}catch(error){if(error.message==='diagnostic-timeout'||error.message==='diagnostic-retired')throw error;}
   }
   if(legacyReceiverPresent){show({state:'legacy-receiver-reload-required-no-request',help:'Chrome 仍在运行旧版接收器。请重新加载 VAIWL 扩展后在新标签打开 ChatGPT 首页；本次未发请求，旧许可不会重用。'});return;}
   const reason=['pagehide','route-event','route-changed','document-hidden','hidden-at-start','hidden-during-attempt','interaction-during-attempt','ready'].includes(ready?.reason)?ready.reason:'unknown';
   show({state:'not-ready-no-request',receiverPresent:ready!==null&&typeof ready==='object',documentReady:ready?.ready===true,unspent:ready?.spent===false,documentKeyPresent:typeof ready?.documentKey==='string',legacyReceiverPresent,reason});return;
  }
  phase='recheck-home';
  const current=await preflight(()=>chrome.tabs.get(tab.id));
  if(current.url!=='https://chatgpt.com/'){show({state:'target-changed-no-request'});return;}
  if(performance.now()>=deadline||epoch!==view)throw Error('diagnostic-retired');
  const original=JSON.stringify({tabId:tab.id,documentKey:ready.documentKey});
  phase='consume';
  localStorage.setItem(key,original);if(marker().raw!==original)throw Error('diagnostic-storage');
  show({state:'consumed-awaiting-result-do-not-repeat'},epoch);
  // This is a reply-observation limit, NOT an extension of the reader's six
  // second network deadline. Delivery uncertainty never permits another ONCE.
  const result=await bounded(()=>chrome.tabs.sendMessage(tab.id,{type:PROBE_PREFIX+'_ONCE',documentKey:ready.documentKey},{frameId:0}),8000);
  receive(result,original,epoch);
 });}catch(error){
  try{
   const m=marker();
   if(m.raw!==null)show(saved(m)??{state:'consumed-delivery-unconfirmed-no-retry'},epoch);
   else if(!entered)show({state:'diagnostic-busy-no-request'},epoch);
   else if(phase==='consume')show({state:'local-state-unavailable-no-request'},epoch);
   else if(error.message==='diagnostic-timeout')show({state:'preflight-timeout-no-request'},epoch);
   else if(phase==='receiver')show({state:'receiver-not-loaded-no-request',help:'当前页未加载此诊断接收器；本次未发请求，不要重复重载或重登。'},epoch);
   else show({state:'tab-selection-failed-no-request'},epoch);
  }catch{show({state:'local-state-unavailable-no-request'},epoch);}
 }finally{clearTimeout(timer);lock.abort();busy=false;updateButton();}
});
document.getElementById('read').addEventListener('click',async()=>{
 const epoch=++view;let m;
 try{m=marker();}catch{show({state:'local-state-unavailable-no-request'},epoch);return;}
 if(m.raw===null){show({state:'no-request-issued'},epoch);return;}
 const result=saved(m);if(result){show(result,epoch);return;}
 // Old receipts have no original document identity. A matching tab number or
 // URL after navigation must not relabel a new document's result as this run.
 if(!bound(m)){show({state:'result-unavailable-no-retry'},epoch);return;}
 try{receive(await bounded(()=>chrome.tabs.sendMessage(m.value.tabId,{type:PROBE_PREFIX+'_STATUS',documentKey:m.value.documentKey},{frameId:0}),2000),m.raw,epoch);}
 catch{try{show(saved(marker())??{state:'result-unavailable-no-retry'},epoch);}catch{show({state:'result-unavailable-no-retry'},epoch);}}
});
