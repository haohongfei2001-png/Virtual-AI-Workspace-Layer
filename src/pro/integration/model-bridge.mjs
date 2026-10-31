import {createOrganizeService} from '../jobs/organize-service.mjs';
import {createSameDatabaseBillingStore} from './billing-store.mjs';
import {validateModelConfiguration} from '../model/configuration.mjs';
import {digest} from '../../data/hash.mjs';
import {createModelBudgetOwner,disabledModelBudgetSettings,verifyModelBudgetFence} from './model-budget.mjs';
const synchronousTrue=value=>{if(value&&typeof value==='object'){try{Promise.prototype.then.call(value,()=>{},()=>{});}catch{}}return value===true;};

/** The packaged owner owns this bridge. RPC only starts/observes a task; it
 * never lends a six-second UI request to a long provider call. A detached task
 * retains the original live document's expiring authority and policy generation,
 * not a renewable grant. There is no fetch fallback, credential store or timer
 * that keeps the extension worker alive. Worker termination is recovered from
 * the existing durable budget/job ledger with no automatic redispatch.
 */
export function createProductionModelBridge({provider=null,connection,context,register,applyAutomatic=null,getProposalReceipt=null,dispatchFence=null,now=Date.now,notify=()=>{}}={}) {
  if(typeof connection!=='function'||typeof context!=='function'||typeof register!=='function')throw Error('model-owner-required');
  const tasks=new Map(),recoveryCursors=new Map();let stopped=false;
  let configuration=null;
  try{if(provider?.configuration)configuration=validateModelConfiguration(provider.configuration,new Date(now()).toISOString(),{requireCurrent:false});}catch{/* Invalid configuration leaves local/manual features available. */}
  const configured=!!configuration&&provider?.enabled===true&&typeof provider?.transport==='function'&&typeof provider?.authorizeDispatch==='function'&&typeof provider?.canUse==='function';
  let disclosure=null;
  try{
    const d=structuredClone(provider?.disclosure),url=new URL(d.policyUrl);
    if(Object.keys(d).length!==4||!['provider','policyVersion','policyUrl','retentionText'].every(k=>typeof d[k]==='string'&&d[k].length>0&&d[k].length<=(k==='retentionText'?1000:k==='policyUrl'?500:128))||url.protocol!=='https:'||url.username||url.password||!['openai.com','platform.openai.com','developers.openai.com'].includes(url.hostname))throw Error('model-disclosure-required');
    disclosure=Object.freeze(d);
  }catch{/* Disclosure is required before the frame can enable cloud mode. */}
  const approved=session=>{
    if(!configured||provider?.enabled!==true||stopped)return false;
    try{if(disclosure&&digest(provider.disclosure)!==digest(disclosure))return false;}catch{return false;}
    try{const current=validateModelConfiguration(provider.configuration,new Date(now()).toISOString());if(digest(current)!==digest(configuration))return false;return session.live()===true&&session.canRun()===true&&provider.canUse(session.context)===true;}catch{return false;}
  };
  const page=(offset,total,count,limit)=>({offset,total,count,limit,hasMore:offset+count<total});
  const blankStatus=()=>({configured:!!configuration,enabled:false,provider:configuration?.profile?.providerProfileId??null,model:configuration?.profile?.frozenModelVersion??null,profileId:configuration?.profile?.id??null,inputKinds:['metadata'],currency:configuration?.priceCard?.currency??null,automaticEnabled:false,budget:{currency:configuration?.priceCard?.currency??null,reserved:0,uncertain:0,settled:0,blocked:true,limitScope:'this-installation-only'},jobs:[],totalJobs:0,runningCount:0,page:page(0,0,0,20)});
  function compose(session,{running=false,budgetAdmin=false,reviewAutomation=false,automaticTrigger=false}={}) {
    const authority=Object.freeze({}),localAbort=new AbortController();
    let executionBudgetFence=null,automaticAdmission=null;
    const live=()=>!stopped&&!localAbort.signal.aborted&&session.live()===true&&(!running||approved(session));
    const check=()=>{if(!live())throw Error('model-authority-expired');};
    const sourceFence=dispatchFence?dispatchFence(session):null;
    const billingStore=createSameDatabaseBillingStore({enabled:true,connection:()=>connection(session.context),clock:()=>new Date(now()).toISOString(),verifyDispatchFence(tx,scope,checkpoint,checkTx,ready,fail){
      const budgetReady=()=>{if(!executionBudgetFence){fail('model-budget-required');return;}verifyModelBudgetFence(tx,executionBudgetFence,checkTx,ready,fail,{now:new Date(now()).toISOString()});};
      if(sourceFence)return sourceFence(tx,scope,checkpoint,checkTx,budgetReady,fail);return budgetReady();
    },verifyAuthority(candidate,intent){
      if(candidate!==authority)throw Error('model-authority-invalid');check();
      if(automaticTrigger&&['RESERVE_JOB','DISPATCH_JOB'].includes(intent.action)){
        if(!automaticAdmission||session.autoRequested?.()!==true||!synchronousTrue(provider.automation.isCurrent(session.context,structuredClone(automaticAdmission))))throw Error('automatic-policy-expired');
      }
      if(intent.action==='DISPATCH_JOB'&&dispatchFence&&session.dispatchCurrent?.()!==true)throw Error('stale-model-input');
      if(intent.action==='CONFIGURE_USER_BUDGET'&&(!budgetAdmin||!approved(session)))throw Error('model-billing-admin-required');
      if(intent.action==='ENSURE_USER_BUDGET_PERIODS'&&!approved(session))throw Error('model-purpose-approval-required');
      // Display/cancel/recovery never grants budget administration or a refund.
      if(['CONFIGURE_POLICIES','RECONCILE_CHARGE','RECONCILE_NO_CHARGE'].includes(intent.action))throw Error('model-billing-admin-required');
      return session.scope;
    }});
    const budget=createModelBudgetOwner({configuration,billingStore,scopeKey:session.scope.key,clock:()=>new Date(now()).toISOString()});
    const automaticOwner=typeof provider?.automation?.policy==='function'&&typeof provider?.automation?.isCurrent==='function'&&typeof applyAutomatic==='function';
    const service=createOrganizeService({enabled:configured,configuration,billingStore,transport:provider?.transport,
      budgetOwner:{
        async prepare(candidate,options,signal){if(candidate!==authority)throw Error('model-authority-invalid');check();if(!approved(session))throw Error('model-purpose-approval-required');const value=await budget.prepare(candidate,options,signal);check();if(options.writePeriods)executionBudgetFence=value.fence;return value;},
        async assertCurrent(candidate,fence,signal){if(candidate!==authority)throw Error('model-authority-invalid');check();return budget.assertCurrent(candidate,fence,signal);}
      },
      automation:automaticOwner?{
        async policy(candidate,options){
          if(candidate!==authority)throw Error('model-authority-invalid');check();if(!approved(session)||!reviewAutomation&&session.autoRequested?.()!==true)return null;
          const value=await provider.automation.policy(session.context,options);check();
          if(automaticTrigger)automaticAdmission=value?.firstRun===false&&value.autoRequested===true?structuredClone({phase:'dispatch-admission',quality:value.quality,modelProfile:options.profile,pack:options.context.pack,versions:options.context.currentVersions}):null;
          return value;
        },
        async apply(candidate,input,signal){
          if(candidate!==authority)throw Error('model-authority-invalid');check();
          const current=()=>{try{return live()&&approved(session)&&session.autoRequested?.()===true&&synchronousTrue(provider.automation.isCurrent(session.context,input));}catch{return false;}};
          if(!current())throw Error('automatic-policy-expired');
          return applyAutomatic(session,input,signal,current);
        }
      }:null,
      authorizeDispatch:async(candidate,details,signal)=>{if(candidate!==authority)throw Error('model-authority-invalid');check();if(!approved(session))throw Error('model-purpose-approval-required');return provider.authorizeDispatch(session.context,details,signal);},
      getContext:async(candidate,options)=>{if(candidate!==authority)throw Error('model-authority-invalid');check();return context(session,options,live);},
      getProposalReceipt:typeof getProposalReceipt==='function'?async(candidate,input,signal)=>{if(candidate!==authority)throw Error('model-authority-invalid');check();return getProposalReceipt(session,input,signal,live);}:null,
      registerProposals:async(candidate,input,signal)=>{if(candidate!==authority)throw Error('model-authority-invalid');check();if(!approved(session))throw Error('model-purpose-approval-required');return register(session,input,signal,live);},
      clock:()=>new Date(now()).toISOString(),timeoutMs:30000});
    return {authority,service,budget,abort:localAbort,live};
  }
  async function status(session,signal,{offset=0,limit=20}={}) {
    if(!Number.isSafeInteger(offset)||offset<0||offset>1000||!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('invalid-model-page');
    if(!session.live()||stopped)throw Error('model-authority-expired');
    if(session.scope.persistence!=='same-idb'||!configuration)return {...blankStatus(),backgroundWhileNative:session.backgroundWhileNative?.()===true};
    const task=compose(session);
    try{const value=await task.service.status({authority:task.authority,signal,offset,limit}),budget=await task.budget.settings(task.authority,signal),current=approved(session);return {...value,backgroundWhileNative:session.backgroundWhileNative?.()===true,budget:{...value.budget,blocked:value.budget.blocked||budget.blocked},enabled:value.enabled&&current&&!!disclosure,automaticEnabled:value.automaticEnabled&&current&&!!disclosure&&!budget.blocked,page:value.page??page(offset,value.totalJobs,value.jobs.length,limit),runningCount:[...tasks.values()].filter(t=>t.session.scope.key===session.scope.key).length};}
    finally{task.service.stop();}
  }
  function start(session,{refIds=null,batchMessage='',reviewOnly=false,automaticTrigger=false}={}) {
    if(!approved(session)||session.scope.persistence!=='same-idb')return {state:'unavailable',message:'云整理尚未获得当前用途、模型与费用许可。本地整理和人工操作仍可使用。'};
    const key=session.key,existing=tasks.get(key);if(existing)return {state:'registered',message:'整理仍在处理中，可在模型与预算中查看或停止。'};
    const task=compose(session,{running:true,automaticTrigger});task.session=session;tasks.set(key,task);
    // Rejections are consumed here. Neither errors nor raw model output can
    // escape into browser logs or frames. The service saves its finite result.
    task.promise=task.service.run({authority:task.authority,signal:task.abort.signal,firstRun:true,refIds,reviewOnly,automaticTrigger}).catch(()=>({state:'failed'})).finally(()=>{
      if(tasks.get(key)===task)tasks.delete(key);task.service.stop();if(session.live())notify(session.scope.key);
    });
    return {state:'registered',message:reviewOnly?'已开始复核明确选择的聊天。结果只作为建议，不自动应用；费用继续受当前上限约束。':'已开始核对获准的标题。仅当前已批准且通过质量门的低风险操作可以自动应用；其余结果进入建议，变化保留记录与撤销。'+batchMessage};
  }
  async function preview(session,{signal,refIds=null,reviewOnly=false}={}){
    if(!approved(session)||!disclosure||session.scope.persistence!=='same-idb')throw Error('model-purpose-approval-required');
    const task=compose(session,{reviewAutomation:true});try{const value=await task.service.preview({authority:task.authority,signal,refIds,reviewOnly});if(value.state!=='ready')throw Error('model-preview-unavailable');return {...value,disclosure,versions:session.dispatchVersions};}finally{task.service.stop();}
  }
  async function budgetSettings(session,signal){
    if(!session.live()||stopped)throw Error('model-authority-expired');
    if(!configuration||session.scope.persistence!=='same-idb')return disabledModelBudgetSettings(new Date(now()).toISOString());
    const task=compose(session);try{return await task.budget.settings(task.authority,signal);}finally{task.service.stop();}
  }
  async function configureBudget(session,input,signal){
    if(!approved(session)||session.scope.persistence!=='same-idb')throw Error('model-purpose-approval-required');
    const task=compose(session,{budgetAdmin:true});try{return await task.budget.configure(task.authority,input,signal);}finally{task.service.stop();}
  }
  async function validateBudgetReview(session,fence,signal){
    if(!approved(session)||!fence)throw Error('model-consent-preview-expired');
    const task=compose(session);try{await task.budget.assertCurrent(task.authority,fence,signal);if(!approved(session))throw Error('model-consent-preview-expired');return true;}finally{task.service.stop();}
  }
  async function cancelJob(session,jobId,signal) {
    if(!session.live())throw Error('model-authority-expired');
    for(const task of tasks.values())if(task.session.scope.key===session.scope.key)task.service.abortJob(jobId);
    if(!configuration)return blankStatus();
    const task=compose(session);
    try{await task.service.cancel({authority:task.authority,jobId,signal});return status(session,signal);}finally{task.service.stop();}
  }
  async function recover(session,signal){
    if(!session.live())throw Error('model-authority-expired');
    if(!configuration)return blankStatus();
    const task=compose(session);
    try{const result=await task.service.recover({authority:task.authority,signal,cursor:recoveryCursors.get(session.key)??null});if(result.receiptPage?.nextCursor)recoveryCursors.set(session.key,result.receiptPage.nextCursor);else recoveryCursors.delete(session.key);return status(session,signal);}finally{task.service.stop();}
  }
  function revoke(key){recoveryCursors.delete(key);for(const [id,task]of tasks)if(task.session.key===key||task.session.scope.key===key){recoveryCursors.delete(task.session.key);task.abort.abort();task.service.revoke(task.session.scope.key);}}
  function stop(){if(stopped)return;stopped=true;for(const task of tasks.values()){task.abort.abort();task.service.stop();}tasks.clear();recoveryCursors.clear();}
  return Object.freeze({approved,status,start,preview,budgetSettings,configureBudget,validateBudgetReview,cancel:cancelJob,recover,revoke,stop,isIdle:()=>tasks.size===0,running:key=>tasks.has(key),configured});
}
