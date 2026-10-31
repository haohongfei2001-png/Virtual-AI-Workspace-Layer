import {validatePublicProReply, PRO_FRAME_BYTES} from '../integration/public-frame-dto.mjs';
import {stable,sha256} from '../../data/hash.mjs';

const tables = ['topics','titles','placements','constraints','series','legacyResolutions','proposals'];
const clone = value => structuredClone(value);
const empty = () => ({scopeKey:'unavailable',...Object.fromEntries(tables.map(k=>[k,{}]))});
const modes = ['native','pro-default-none','pro-cross-project'];
const sameReview=(a,b)=>!!a&&!!b&&['scopeKey','authorizationEpoch','overlayRevision','reviewId'].every(key=>a[key]===b[key]);

/** This controller owns only bounded, action-specific display DTOs. All domain
 * planning, read sets, proposal registration, grants and receipts stay worker
 * local. A successful reply is fenced again by the active frame lifecycle. */
export function createRemoteProController({request,isCurrent=()=>true,onMode=()=>{},mountNativeView=null,openBackup=null,sidebarViewport=null,getIntentEpoch=()=>0,makeOperationId=()=>`pro_${crypto.randomUUID().replaceAll('-','')}`}={}) {
  if(typeof request!=='function'||typeof isCurrent!=='function'||typeof getIntentEpoch!=='function')throw Error('pro-remote-transport-required');
  const listeners=new Set();
  const intents=new Map(),reviewObjects=new WeakMap();let intentGeneration=0,intentAuthority=getIntentEpoch(),intentPage=null;
  let stopped=false,epoch=0,serial=0,panelSerial=0,rowSerial=0,modeSerial=0,operationSerial=0,pageData=null,panelData=null,rowData=null,refreshing=null,retainedPro=null;
  let selectedMode='pro-default-none',selectedProjects=[],segment=0,offset=0,inventoryOffsets={uncollected:0,pending:0};
  const notify=()=>{for(const fn of [...listeners])try{fn();}catch{}};
  const valid=run=>!stopped&&run===epoch&&isCurrent()===true;
  function retireIntents(){intentGeneration++;intents.clear();}
  function syncIntentEpoch(){const current=getIntentEpoch();if(current!==intentAuthority){intentAuthority=current;retireIntents();}}
  function runIntent(key,signature,review,execute){
    if(!valid(epoch))throw Error('pro-frame-unavailable');syncIntentEpoch();
    let entry=(review?reviewObjects.get(review):null)??intents.get(key);
    if(entry&&(entry.generation!==intentGeneration||entry.key!==key||entry.signature!==signature))throw Error('stale-pro-reviewed-intent');
    if(!entry){
      if(intents.size>=64){const completed=[...intents].find(([,value])=>value.done);if(completed)intents.delete(completed[0]);else throw Error('pro-reviewed-intent-capacity');}
      entry={key,signature,generation:intentGeneration,operationId:makeOperationId(),pending:null,done:false,value:null};intents.set(key,entry);
    }
    if(review)reviewObjects.set(review,entry);
    if(entry.done)return Promise.resolve(clone(entry.value));
    if(entry.pending)return entry.pending;
    const pending=(async()=>{const value=await execute(entry.operationId);syncIntentEpoch();if(!valid(epoch)||entry.generation!==intentGeneration)throw Error('stale-pro-reviewed-intent');entry.value=clone(value);entry.done=true;return clone(value);})().finally(()=>{if(entry.pending===pending)entry.pending=null;});
    entry.pending=pending;return pending;
  }
  function reviewedIntent(kind,review,expected,execute){
    if(typeof review?.previewId!=='string')throw Error('pro-preview-required');
    const key=kind+':'+review.previewId,signature=JSON.stringify([kind,review.previewId,expected?[expected.scopeKey,expected.authorizationEpoch,expected.overlayRevision,expected.reviewId]:null]);
    return runIntent(key,signature,review,execute);
  }
  function clear(){pageData=panelData=rowData=retainedPro=null;serial++;panelSerial++;rowSerial++;operationSerial++;notify();}
  function capturePro(){return pageData&&selectedMode!=='native'?{scopeKey:pageData.versions.scopeKey,authorizationEpoch:pageData.versions.authorizationEpoch,mode:selectedMode,selectedProjects:[...selectedProjects],segment,offset,inventoryOffsets:{...inventoryOffsets},row:rowData?{topicId:rowData.topicId,lane:rowData.lane,offset:rowData.page.offset,limit:rowData.page.limit}:null}:null;}
  const retainedCurrent=value=>!!value&&value.scopeKey===pageData?.versions.scopeKey&&value.authorizationEpoch===pageData?.versions.authorizationEpoch;
  function restoreCoordinates(value){segment=value.segment;offset=value.offset;inventoryOffsets={...value.inventoryOffsets};}
  async function restoreRows(value){if(value?.row&&retainedCurrent(value))try{await controller.loadRows(value.row.topicId,value.row.lane,value.row);}catch{/* The fresh page remains usable when a former row window no longer exists. */}}
  async function call(action,payload){
    const run=epoch;if(!valid(run))throw Error('pro-frame-unavailable');
    const bytes=new TextEncoder().encode(JSON.stringify(payload)).length;if(bytes>PRO_FRAME_BYTES-1024)throw Error('pro-request-too-large');
    const result=await request(action,clone(payload));
    if(!valid(run))throw Error('pro-frame-unavailable');
    if(result?.ok!==true)throw Error('pro-request-unavailable');
    return validatePublicProReply(action,result.value);
  }
  function currentVersions(){const v=panelData?.versions??rowData?.versions??pageData?.versions;if(!v)throw Error('pro-view-unavailable');return clone(v);}
  function adoptPage(value){
    if(value.kind!=='pro-frame-page')throw Error('invalid-pro-page-response');
    syncIntentEpoch();const identity=JSON.stringify([value.versions.scopeKey,value.versions.authorizationEpoch]);if(intentPage!==null&&identity!==intentPage)retireIntents();intentPage=identity;
    const old=pageData?.versions;
    if(old&&(old.scopeKey!==value.versions.scopeKey||old.authorizationEpoch!==value.versions.authorizationEpoch)){panelData=rowData=retainedPro=null;}
    pageData=value;panelData=rowData=null;panelSerial++;rowSerial++;operationSerial++;
    selectedMode=value.status.mode;selectedProjects=[...value.status.selectedProjectIds];segment=value.status.segment;
    onMode(selectedMode);notify();return getView();
  }
  async function refresh({force=false}={}){
    if(refreshing&&!force)return refreshing;
    const ticket=++serial;
    const pending=(async()=>{try{const value=await call('view',{op:'page',mode:selectedMode,selectedProjectIds:selectedProjects,segment,offset,inventoryOffsets,limit:8,rowLimit:5});if(ticket!==serial)return getView();return adoptPage(value);}catch(e){if(ticket===serial){clear();}throw e;}finally{if(refreshing===pending)refreshing=null;}})();
    refreshing=pending;return pending;
  }
  function getState(){
    const result=empty();
    for(const source of [pageData,rowData,panelData])if(source?.display){result.scopeKey=source.display.scopeKey;for(const k of tables)Object.assign(result[k],clone(source.display[k]));}
    return result;
  }
  function getSnapshot(){
    const items=new Map();for(const source of [pageData,rowData,panelData])for(const item of source?.items??[])items.set(item.id,clone(item));
    return {references:[...items.values()].slice(-400),versions:pageData?currentVersions():{scopeKey:'unavailable',authorizationEpoch:0,overlayRevision:0,reviewId:'unavailable'},authorized:!!pageData&&valid(epoch),projects:clone(panelData?.projects??pageData?.projects??[])};
  }
  function getView(){return pageData?clone(pageData.view):{mode:selectedMode,native:{groups:{items:[]}}};}
  function getStatus(){return pageData?clone({...pageData.status,authorized:valid(epoch),mode:selectedMode,selectedProjectIds:selectedProjects,segment}):{authorized:false,entitlement:'free',processingMode:'off',cloudBudget:0,mode:selectedMode,selectedProjectIds:[],segment,positiveNone:'unavailable'};}
  function getProjection(){
    const p=pageData?clone(pageData.projection):{groups:[],uncollected:[],pending:[],maxSegment:0};
    if(rowData){const group=p.groups.find(g=>g.topicId===rowData.topicId);if(group){group[rowData.lane]=clone(rowData.rows);if(rowData.lane==='current')group.undated=[];group.windows[rowData.lane]=clone(rowData.page);}}
    return p;
  }
  async function loadPanel(kind,id=null,{offset=0,limit=24}={}){
    const ticket=++panelSerial,review=pageData?.versions.reviewId;const value=await call('view',{op:'panel',kind,id,offset,limit});if(ticket!==panelSerial)return null;if(value.kind!=='pro-panel-page'||value.panel!==kind||value.versions.scopeKey!==pageData?.versions.scopeKey||value.versions.authorizationEpoch!==pageData?.versions.authorizationEpoch||value.versions.reviewId!==review||pageData?.versions.reviewId!==review)throw Error('invalid-pro-panel-response');panelData=value;return clone(value);
  }
  async function mutate(action,payload){const result=await call(action,payload);await refresh({force:true});return result;}
  const preview=async(kind,input={},options={})=>{const expected=options.expected??currentVersions();const value=await call('commit',{op:'preview',kind,input,expected});return {...value,expected:value.expected??clone(expected)};};
  const controller={
    getState,getSnapshot,getView,getStatus,getProjection,
    ...(sidebarViewport?{getSidebarViewport:sidebarViewport}:{}),
    getPage:()=>clone(pageData?.page??{offset:0,total:0,count:0,limit:8,hasMore:false}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},refresh,loadPanel,
    async dispatch(command,{expected=currentVersions(),operationId}={}){
      const input=clone({command,expected});if(operationId!==undefined)return mutate('commit',{op:'dispatch',...input,operationId});
      const signature=stable(input);if(new TextEncoder().encode(signature).length>PRO_FRAME_BYTES-1024)throw Error('pro-request-too-large');
      return runIntent('dispatch:'+sha256(signature),signature,null,id=>mutate('commit',{op:'dispatch',...input,operationId:id}));
    },
    async getOperations({offset=0,limit=24}={}){const p=await loadPanel('records',null,{offset,limit});return clone(p?.operations??[]).reverse();},
    getPanelPage:()=>panelData?clone(panelData.page):null,
    previewUndo:(id,options)=>preview('undo',{operationId:id},options),
    async beginOperationReview(operationId,{expected=currentVersions()}={}){
      const result=await preview('undo-review',{operationId},{expected});
      if(result.kind!=='pro-preview'||!['ready','conflict'].includes(result.state)||Object.hasOwn(result,'inverseHash')||!sameReview(result.expected,expected)||!sameReview(expected,pageData?.versions))throw Error('stale-pro-operation-review');
      return {...result,operationId,expected:clone(expected)};
    },
    async loadOperationReview(review,{offset=0,limit=24}={}){
      if(!sameReview(review?.expected,pageData?.versions))throw Error('stale-pro-operation-review');
      const ticket=++operationSerial,value=await call('view',{op:'operation-review',previewId:review.previewId,offset,limit,expected:review.expected});
      if(ticket!==operationSerial||!sameReview(review.expected,pageData?.versions))throw Error('stale-pro-operation-review');
      if(value.kind!=='pro-operation-page'||value.previewId!==review.previewId||value.operationId!==review.operationId||value.page.offset!==offset||!sameReview(value.versions,review.expected))throw Error('invalid-pro-operation-review');
      return value;
    },
    undo:(id,inverseHash)=>controller.dispatch({type:'UNDO_TRANSACTION',targetOperationId:id,reviewedInverseHash:inverseHash}),
    previewCompensation:(id,{restoreKeys=[],expected}={})=>preview('compensation',{operationId:id,restoreKeys},{expected}),
    previewDelete:(topicId,options)=>preview('delete',{topicId},options),
    previewRemoveAI:(refIds,options)=>preview('remove-ai',{refIds},options),
    previewMerge:(input,options)=>preview('merge',input,options),previewSplit:(input,options)=>preview('split',input,options),previewSeries:(input,options)=>preview('series',input,options),previewSeriesEdit:(input,options)=>preview('series-edit',input,options),
    previewLegacyPrimary:(refId,chosenPrimary,options)=>preview('legacy-primary',{refId,chosenPrimary},options),
    previewLegacyUpgrade:options=>preview('legacy-upgrade',{},options),
    recoveryPreview:()=>call('commit',{op:'recovery-preview'}),
    recoveryApply:async review=>reviewedIntent('recovery',review,null,operationId=>call('commit',{op:'recovery-apply',previewId:review.previewId,operationId})),
    async applyStructure(result){const expected=result?.expected??currentVersions();return reviewedIntent('structure',result,expected,operationId=>mutate('commit',{op:'apply-structure',previewId:result.previewId,expected,operationId}));},
    async suggest(){const result=await call('evidence',{op:'suggest',expected:currentVersions()});await refresh({force:true});await loadPanel('suggestions');return result;},
    applyProposal:(id,planHash)=>controller.dispatch({type:'ACCEPT_PROPOSAL',proposalId:id,planHash}),
    applyProposalBatch:proposals=>controller.dispatch({type:'ACCEPT_PROPOSAL_BATCH',proposals:proposals.map(p=>({proposalId:p.proposalId??p.id,planHash:p.planHash}))}),
    async search(query,{topicId=null}={}){const value=await call('view',{op:'search',query,topicId,limit:24});if(value.kind!=='pro-search-page')throw Error('invalid-pro-search-response');return value.items;},
    async setMode(mode,{selectedProjectIds=[],resumeView=null}={}){
      if(!modes.includes(mode))throw Error('invalid-mode');const ticket=++modeSerial;
      const prior=capturePro(),restore=retainedCurrent(resumeView)?resumeView:null;
      const result=await call('background',{op:'mode',mode,selectedProjectIds});
      if(ticket!==modeSerial)return getStatus();
      if(mode==='native'&&prior)retainedPro=prior;
      selectedMode=mode;selectedProjects=[...selectedProjectIds];if(restore)restoreCoordinates(restore);else if(mode!=='native'){segment=0;offset=0;inventoryOffsets={uncollected:0,pending:0};}onMode(mode);
      if(mode==='native'){if(pageData)pageData.status.mode=mode;return result;}
      const view=await refresh({force:true});await restoreRows(restore);return view;
    },
    resumePro(){const saved=retainedCurrent(retainedPro)?retainedPro:null;return controller.setMode(saved?.mode??'pro-default-none',{selectedProjectIds:saved?.selectedProjects??[],resumeView:saved});},
    async synchronizeMode(){const ticket=modeSerial,value=await call('background',{op:'status'});if(ticket!==modeSerial)return getStatus();if(value.kind!=='pro-status')throw Error('invalid-pro-status-response');const prior=capturePro(),changed=value.status.mode!==selectedMode;if(changed&&value.status.mode==='native'&&prior)retainedPro=prior;const restore=changed&&value.status.mode!=='native'&&retainedCurrent(retainedPro)&&retainedPro.mode===value.status.mode&&JSON.stringify(retainedPro.selectedProjects)===JSON.stringify(value.status.selectedProjectIds)?retainedPro:null;selectedMode=value.status.mode;selectedProjects=[...value.status.selectedProjectIds];if(restore)restoreCoordinates(restore);onMode(selectedMode);if(pageData)pageData.status=value.status;if(selectedMode!=='native'){await refresh({force:true});await restoreRows(restore);}return value.status;},
    async setLocalProcessing(value){if(!['local','off'].includes(value))throw Error('unsupported-processing-mode');return mutate('background',{op:'processing',mode:value});},
    async setSegment(value){if(!Number.isSafeInteger(value)||value<0)throw Error('invalid-segment');segment=value;offset=0;return refresh({force:true});},
    async setPage(value){if(!Number.isSafeInteger(value)||value<0)throw Error('invalid-page');offset=value;return refresh({force:true});},
    async setInventoryPage(kind,value){if(!['uncollected','pending'].includes(kind)||!Number.isSafeInteger(value)||value<0)throw Error('invalid-inventory-page');inventoryOffsets={...inventoryOffsets,[kind]:value};return refresh({force:true});},
    async loadRows(topicId,lane,{offset=0,limit=17}={}){const ticket=++rowSerial,review=pageData?.versions.reviewId;const value=await call('view',{op:'rows',topicId,lane,offset,limit});if(ticket!==rowSerial)return null;if(value.kind!=='pro-rows-page'||value.topicId!==topicId||value.lane!==lane||value.versions.scopeKey!==pageData?.versions.scopeKey||value.versions.authorizationEpoch!==pageData?.versions.authorizationEpoch||value.versions.reviewId!==review||pageData?.versions.reviewId!==review)throw Error('invalid-pro-rows-response');rowData=value;panelData=null;notify();return value;},
    async open(refId,options={}){const result=await call('navigation',{op:'open',refId,options});if(result.state!=='native-link')await refresh({force:true});return result;},
    async returnToWorkspace(){const result=await call('navigation',{op:'return'});await refresh({force:true});return result;},
    mountNativeView:mountNativeView?((root,options)=>mountNativeView(root,controller,options)):undefined,
    ...(openBackup?{openBackup}:{}),
    clear,
    destroy(){if(stopped)return;stopped=true;epoch++;serial++;retireIntents();clear();listeners.clear();},
  };
  return Object.freeze(controller);
}
