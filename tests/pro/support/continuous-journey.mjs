import {placementId,emptyOverlay} from '../../../src/pro/domain/index.mjs';
import {digest} from '../../../src/data/hash.mjs';
import {replayOverlayJournal} from '../../../src/pro/migration/recovery.mjs';

const ensure=(value,message)=>{if(!value)throw Error(message);};
/** Same c_beta through all required stages. Real commands, ports, plans and
 * journal; caller chooses MockIDB or a real isolated browser IndexedDB.
 */
export async function runContinuousJourney(owner,controller){
  const trace=[];
  const mark=(step,detail={})=>trace.push({step,...detail,revision:controller.getState().revision});
  const C='c_beta';
  await controller.setMode('native');
  ensure(controller.getSnapshot().references.find(r=>r.id===C).membership.state==='NONE','positive-NONE-fixture');
  mark('legal-NONE-in-Free');
  await controller.setMode('pro-default-none');
  await controller.dispatch({type:'CREATE_TOPIC',name:'Riftlet 首击可靠性'});
  const a=Object.values(controller.getState().topics).find(t=>t.name==='Riftlet 首击可靠性').id;
  await controller.dispatch({type:'CREATE_TOPIC',name:'人工纠正主题'});
  const b=Object.values(controller.getState().topics).find(t=>t.name==='人工纠正主题').id;
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:a,role:'primary'});
  mark('manual-topic-created');
  const suggestions=await controller.suggest({refIds:[C]});
  const p=suggestions.proposals.find(p=>p.kind==='existing-topic'&&p.refId===C&&p.topicId===a);
  ensure(p&&p.qualityBand==='review','first-round-preview');
  ensure(!controller.getState().placements[placementId(a,C)],'preview-does-not-commit');
  const accepted=await controller.applyProposal(p.id,p.planHash);
  ensure(controller.getState().placements[placementId(a,C)].role==='primary','suggestion-accepted');
  mark('fixture-AI-suggestion-reviewed',{adapter:suggestions.adapter,operationId:accepted.operationId});
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:C,title:'首击可靠性 · 修复核对'});
  const moved=await controller.dispatch({type:'MOVE_PRIMARY',refId:C,from:a,to:b});
  ensure(Object.values(controller.getState().constraints).some(x=>x.kind==='exclude-topic'&&x.refId===C&&x.topicId===a),'precise-old-topic-exclusion');
  ensure(controller.getState().placements[placementId(b,C)].control.mode==='human','human-move-protected');
  mark('manual-correction-and-hard-exclusion');
  const ready=await controller.previewUndo(moved.operationId);
  ensure(ready.state==='ready','move-undo-ready');
  await controller.undo(moved.operationId,ready.inverseHash);
  ensure(controller.getState().placements[placementId(a,C)]&&!controller.getState().placements[placementId(b,C)],'atomic-move-inverse');
  mark('atomic-undo');
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:C,title:'之后的人工标题'});
  const before=digest(controller.getState()),conflict=await controller.previewUndo(accepted.operationId);
  // A later placement write, not an unrelated title, must conflict with its inverse.
  await controller.dispatch({type:'SET_LOCK',target:{kind:'placement',refId:C,topicId:a},locked:true});
  const changed=digest(controller.getState()),actualConflict=await controller.previewUndo(accepted.operationId);
  ensure(actualConflict.state==='conflict','undo-conflict-detected');
  let blocked=false;try{await controller.undo(accepted.operationId,actualConflict.inverseHash);}catch{blocked=true;}
  ensure(blocked&&digest(controller.getState())===changed,'undo-conflict-zero-write');
  mark('conflicting-inverse-zero-write',{originalUnrelatedTitleConflict:conflict.state,beforeDigest:before});
  // Separate compensation, explicitly selected and sealed against latest data.
  const latestTitle=await controller.dispatch({type:'SET_DERIVED_TITLE',refId:C,title:'需要补偿的标题'});
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:C,title:'更新的标题'});
  const compensation=controller.previewCompensation(latestTitle.operationId,{restoreKeys:[{kind:'derived-title',key:C}]});
  await controller.dispatch({type:'APPLY_COMPENSATION_PLAN',plan:compensation},{expected:compensation.expected});
  ensure(controller.getState().titles[C].title==='之后的人工标题','explicit-compensation-value');
  ensure(controller.getOperations().find(x=>x.operationId===latestTitle.operationId).status==='applied','compensation-is-new-operation');
  mark('separate-reviewed-compensation');
  const seriesPlan=controller.previewSeries({topicId:a,title:'首击工作线',entries:['c_alpha',C],edges:[{kind:'continuation',from:'c_alpha',to:C}],
    labels:[{refId:'c_alpha',sequence:[1],source:'human-confirmed'},{refId:C,sequence:[2],source:'human-confirmed'}]});
  await controller.applyStructure(seriesPlan);
  const series=Object.values(controller.getState().series)[0];
  await controller.open(C,{topicId:a,seriesId:series.id,origin:'topic'});
  ensure(controller.getStatus().launchContext.topicId===a,'explicit-come-from-topic');
  const returned=await controller.returnToWorkspace();ensure(returned.anchor.cardId===a,'return-restores-origin');
  mark('Series-and-explicit-return');
  // Splitting a partial Series is a real preview conflict; edit its working line
  // explicitly before splitting, preserving the remaining entry and its label.
  const badSplit=controller.previewSplit({retainId:a,children:[{draftKey:'child',name:'修复核对',members:[C]}]});
  ensure(badSplit.conflicts.length>0,'locked-or-series-split-preview-conflict');
  const shortened=controller.previewSeries({seriesId:series.id,topicId:a,title:series.title,entries:['c_alpha'],edges:[],labels:[series.labels[0]]});
  await controller.applyStructure(shortened);
  await controller.dispatch({type:'SET_LOCK',target:{kind:'placement',refId:C,topicId:a},locked:false});
  const split=controller.previewSplit({retainId:a,children:[{draftKey:'child',name:'修复核对',members:[C]}]});
  ensure(!split.conflicts.length,'split-preview-ready');
  await controller.applyStructure(split);
  const child=Object.values(controller.getState().topics).find(t=>t.name==='修复核对').id;
  ensure(controller.getState().placements[placementId(child,C)],'split-new-stable-topic');
  await controller.dispatch({type:'EXCLUDE_TOPIC',refId:C,topicId:b});
  const conflictMerge=controller.previewMerge({keepId:child,sourceIds:[b]});
  ensure(conflictMerge.conflicts.some(x=>x.kind==='include-exclude'),'merge-conflict-preview');
  await controller.dispatch({type:'REMOVE_TOPIC_EXCLUSION',refId:C,topicId:b});
  const merge=controller.previewMerge({keepId:child,sourceIds:[b]});
  await controller.applyStructure(merge);
  ensure(controller.getState().redirects[b].toTopicId===child,'stable-merge-redirect');
  mark('split-merge-with-explicit-conflict-resolution');
  const saved=digest(controller.getState());
  await controller.setMode('native');
  ensure(controller.getView().mode==='native'&&!controller.getView().overlay,'Free-native-projection');
  ensure(digest(controller.getState())===saved,'Free-switch-preserves-assets');
  await controller.setMode('pro-default-none');
  ensure(digest(controller.getState())===saved,'Pro-switch-preserves-assets');
  mark('Free-Pro-switch');
  const raw=await owner.raw();
  const rebuilt=replayOverlayJournal({state:emptyOverlay(owner.scope.key),sequence:0},raw.records);
  ensure(digest(rebuilt.state)===saved,'journal-replays-complete-data-order');
  await controller.restart();
  ensure(digest(controller.getState())===saved,'restart-restores-assets');
  ensure(controller.getStatus().processingMode==='off','restart-does-not-replay-consent');
  const backup=controller.exportBackup();
  ensure(!Object.keys(backup.state.proposals).length,'backup-does-not-export-jobs');
  mark('restart-and-ordered-recovery',{journalRecords:raw.records.length});
  return {status:'PASS',contract:'VAIWL-PRO/1.0',sample:C,fixtureOnly:true,trace,finalDigest:saved,backupDigest:backup.checksum,
    realModelCalls:0,realUserData:false,nativeWritesByPro:0};
}
