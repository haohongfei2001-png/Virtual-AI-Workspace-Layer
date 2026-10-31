import {digest, stable} from '../../data/hash.mjs';
import {boundedJSON, exact, integer, boundedText} from '../model/schema-runtime.mjs';
import {validateSourceScope} from '../evidence/metadata.mjs';
import {assertRegisteredProDatabase} from './storage-registry.mjs';
import {emptyBudgetLedger, validateBudgetLedger, configureBudgetPolicies, reserveBudget,
  markBudgetDispatched, releaseReservation, settleReservation,archiveFinalizedReservations,
  validateUserBudget,validateUserBudgetLimits,userBudgetKey,userBudgetPolicies,userBudgetUsage} from '../jobs/budget.mjs';
import {validateJob, admitJob, transitionJob, recoverJob} from '../jobs/lifecycle.mjs';

/** Opt-in SAME-database billing adapter; never opens/upgrades a database. The
 * registered production owner supplies its existing connection and a
 * synchronous live RAM-authority verifier. One installation root intentionally
 * spans scopes so account changes cannot reset a payer's budget.
 *
 * Legacy readers query their own actual scope keys; all billing root/journal
 * payload.scopeKey values use this distinct namespace. The storage registry
 * records codecs, capacity, lossless retention, backup exclusions and minimum
 * readers. This adapter defaults off and never authorizes provider execution.
 * No credential, grant, provider payload or model response is stored here.
 */
export const BILLING_NAMESPACE = 'vaiwl-pro-billing/1';
export const billingRootKey = JSON.stringify([BILLING_NAMESPACE, 'installation']);
export const billingOperationKey = operationId => JSON.stringify([billingRootKey, operationId]);
export const billingHistoryKey = number => JSON.stringify([billingRootKey,'history',number]);
export const billingArchivedJobKey = id => JSON.stringify([billingRootKey,'job',id]);
export const billingArchivedReservationKey = id => JSON.stringify([billingRootKey,'reservation',id]);
export const BILLING_INTEGRATION_STATUS = Object.freeze({productionEnabled: false,
  sharedCodecRegistration: 'registered-db4', backupRegistration: 'installation-cost-excluded', garbageCollectionRegistration: 'lossless-retention',
  minimumReaderReview: 'explicit-storage-2', networkEffects: false});
const STORES = ['b23_states', 'b23_operations','b23_checkpoints','native_states','native_operations'];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_JOBS = 1000;
const JOURNAL_WINDOW=512,BILLING_READER_V2='vaiwl-pro-billing-storage/2',BILLING_READER_V3='vaiwl-pro-billing-storage/3';
const clone = value => structuredClone(value);
const operationIdOK = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) throw Error('invalid-billing-operation-id'); return value; };
const stateData = root => ({ledger: root.ledger, jobs: root.jobs,...(root.format!=='vaiwl-pro-billing-root/1'?{archivedJobCount:root.archivedJobCount,archivedSettledTotals:root.archivedSettledTotals,archivedCreatedAtHighWater:root.archivedCreatedAtHighWater}:{}),...(root.format==='vaiwl-pro-billing-root/3'?{userBudgets:root.userBudgets}:{})});
const stateDigest = root => digest(stateData(root));
const envelope = (key, payload) => ({key, payload, checksum: digest(payload)});
function unpack(row, key) {
  const captured = boundedJSON(row, {maxBytes: MAX_BYTES + 4096, maxNodes: 500000, maxDepth: 32});
  exact(captured, ['key', 'payload', 'checksum']);
  if (captured.key !== key || captured.checksum !== digest(captured.payload)) throw Error('billing-corrupt-record');
  return captured.payload;
}
function emptyRoot() {
  return {format: 'vaiwl-pro-billing-root/1', minimumReader: BILLING_NAMESPACE, scopeKey: billingRootKey,
    revision: 0, ledger: emptyBudgetLedger(), jobs: {}, operationIds: []};
}
function validateRoot(input) {
  const root = boundedJSON(input, {maxBytes: MAX_BYTES, maxNodes: 500000, maxDepth: 32});
  const withUserBudget=root.format==='vaiwl-pro-billing-root/3',segmented=withUserBudget||root.format==='vaiwl-pro-billing-root/2';
  exact(root, ['format', 'minimumReader', 'scopeKey', 'revision', 'ledger', 'jobs', 'operationIds',...(segmented?['history','archivedJobCount','archivedSettledTotals','archivedCreatedAtHighWater']:[]),...(withUserBudget?['userBudgets']:[])]);
  if ((segmented?root.minimumReader!==(withUserBudget?BILLING_READER_V3:BILLING_READER_V2):root.format !== 'vaiwl-pro-billing-root/1' || root.minimumReader !== BILLING_NAMESPACE) || root.scopeKey !== billingRootKey) throw Error('billing-reader-incompatible');
  if(withUserBudget){if(!root.userBudgets||typeof root.userBudgets!=='object'||Array.isArray(root.userBudgets)||Object.keys(root.userBudgets).length>1000)throw Error('invalid-user-budgets');for(const [key,value]of Object.entries(root.userBudgets)){validateUserBudget(value);if(key!==userBudgetKey(value.billingProfileId))throw Error('invalid-user-budget-key');}}
  if(segmented){if(root.history!==null)validateBillingHistoryPointer(root.history);integer(root.archivedJobCount);validateArchivedTotals(root.archivedSettledTotals);validateArchivedFences(root.archivedCreatedAtHighWater);}
  integer(root.revision); validateBudgetLedger(root.ledger);
  if (!root.jobs || typeof root.jobs !== 'object' || Array.isArray(root.jobs) || Object.keys(root.jobs).length > MAX_JOBS) throw Error('billing-job-capacity');
  if (!Array.isArray(root.operationIds) || root.operationIds.length > (segmented?JOURNAL_WINDOW:10000) || new Set(root.operationIds).size !== root.operationIds.length || root.operationIds.length+(root.history?.sequence??0) !== root.revision) throw Error('invalid-billing-journal-index');
  root.operationIds.forEach(operationIdOK);
  for (const [id, row] of Object.entries(root.jobs)) {
    exact(row, ['scope', 'checkpoint']); validateSourceScope(row.scope); validateJob(row.checkpoint);
    if (row.scope.persistence !== 'same-idb' || row.checkpoint.id !== id ||
        (row.checkpoint.inputVersions && row.checkpoint.inputVersions.scopeKey !== row.scope.key)) throw Error('invalid-persistent-job');
    const reservation = Object.values(root.ledger.reservations).find(record => record.reservation.jobId === id);
    if (['reserved', 'dispatched', 'outcome-unknown'].includes(row.checkpoint.state) && row.checkpoint.modelBinding !== null) {
      if (!reservation || reservation.scopeKey !== row.scope.key || row.checkpoint.reservationId !== reservation.reservation.id) throw Error('job-reservation-mismatch');
      if (row.checkpoint.state === 'reserved' && reservation.reservation.status !== 'reserved') throw Error('job-reservation-mismatch');
      if (['dispatched', 'outcome-unknown'].includes(row.checkpoint.state) && reservation.reservation.status !== 'sent-uncertain') throw Error('job-reservation-mismatch');
    }
  }
  for (const record of Object.values(root.ledger.reservations)) {
    const row = root.jobs[record.reservation.jobId];
    if (!row || row.scope.key !== record.scopeKey) throw Error('orphan-billing-reservation');
  }
  return root;
}
function validateArchivedTotals(value){
  if(!Array.isArray(value)||value.length>10000)throw Error('invalid-billing-archive-summary');const seen=new Set();
  for(const row of value){exact(row,['billingProfileId','currency','settled']);boundedText(row.billingProfileId,128);if(!/^[A-Z]{3}$/.test(row.currency))throw Error('invalid-billing-archive-summary');integer(row.settled);const key=JSON.stringify([row.billingProfileId,row.currency]);if(seen.has(key))throw Error('invalid-billing-archive-summary');seen.add(key);}return value;
}
function validateArchivedFences(value){
  if(!Array.isArray(value)||value.length>10000)throw Error('invalid-billing-archive-fence');const seen=new Set();
  for(const row of value){exact(row,['billingProfileId','currency','through']);boundedText(row.billingProfileId,128);boundedText(row.through,64);const key=JSON.stringify([row.billingProfileId,row.currency]);if(!/^[A-Z]{3}$/.test(row.currency)||!Number.isFinite(Date.parse(row.through))||seen.has(key))throw Error('invalid-billing-archive-fence');seen.add(key);}return value;
}
function validateBillingHistoryPointer(value){exact(value,['number','sequence','checksum','lastDigest']);integer(value.number);integer(value.sequence);if(!value.number||!value.sequence||![value.checksum,value.lastDigest].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw Error('billing-history-pointer-invalid');return value;}
function billingV2(root){return root.format!=='vaiwl-pro-billing-root/1'?root:{...root,format:'vaiwl-pro-billing-root/2',minimumReader:BILLING_READER_V2,history:null,archivedJobCount:0,archivedSettledTotals:[],archivedCreatedAtHighWater:[]};}
function billingV3(root){return root.format==='vaiwl-pro-billing-root/3'?root:{...billingV2(root),format:'vaiwl-pro-billing-root/3',minimumReader:BILLING_READER_V3,userBudgets:{}};}
/** Internal trusted transaction fence: validates the entire registered root,
 * including envelope checksum and reader. It does not create a write grant. */
export function inspectBillingRootRecord(row){return row?validateRoot(unpack(row,billingRootKey)):emptyRoot();}
function validateBillingHistory(row,pointer=null){
  const p=unpack(row,row.key);exact(p,['format','scopeKey','number','startSequence','sequence','previous','operationIds','operationDigests','firstDigest','lastDigest']);
  if(p.format!=='vaiwl-pro-billing-history/1'||p.scopeKey!==billingRootKey||row.key!==billingHistoryKey(p.number))throw Error('billing-history-corrupt');integer(p.number);integer(p.startSequence);integer(p.sequence);
  if(p.previous===null){if(p.number!==1||p.startSequence!==1)throw Error('billing-history-chain-invalid');}else{validateBillingHistoryPointer(p.previous);if(p.number!==p.previous.number+1||p.startSequence!==p.previous.sequence+1||p.firstDigest!==p.previous.lastDigest)throw Error('billing-history-chain-invalid');}
  if(!Array.isArray(p.operationIds)||!p.operationIds.length||p.operationIds.length>10000||new Set(p.operationIds).size!==p.operationIds.length||p.sequence!==p.startSequence+p.operationIds.length-1||!Array.isArray(p.operationDigests)||p.operationDigests.length!==p.operationIds.length)throw Error('billing-history-chain-invalid');p.operationIds.forEach(operationIdOK);
  if(![...p.operationDigests,p.firstDigest,p.lastDigest].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw Error('billing-history-corrupt');
  if(pointer&&stable(pointer)!==stable({number:p.number,sequence:p.sequence,checksum:row.checksum,lastDigest:p.lastDigest}))throw Error('billing-history-anchor-mismatch');return p;
}
function billingHistoryPage(root,logs){const number=(root.history?.number??0)+1,p={format:'vaiwl-pro-billing-history/1',scopeKey:billingRootKey,number,startSequence:(root.history?.sequence??0)+1,sequence:root.revision,
  previous:root.history??null,operationIds:[...root.operationIds],operationDigests:logs.map(digest),firstDigest:logs[0].beforeDigest,lastDigest:logs.at(-1).afterDigest};const row=envelope(billingHistoryKey(number),p);validateBillingHistory(row);return row;}
function readBillingHistory(tx,pointer,check,ready,fail){const q=tx.objectStore('b23_states').get(billingHistoryKey(pointer.number));q.onsuccess=()=>{try{check();if(!q.result)throw Error('billing-missing-history');ready(validateBillingHistory(q.result,pointer));}catch(e){fail(e.message);}};}
function proveBillingLog(tx,root,log,check,ready,fail){
  if(log.sequence>(root.history?.sequence??0)){if(root.operationIds[log.sequence-(root.history?.sequence??0)-1]!==log.operationId){fail('billing-orphan-receipt');return;}ready();return;}
  const visit=pointer=>readBillingHistory(tx,pointer,check,p=>{const index=log.sequence-p.startSequence;if(index>=0){if(p.operationIds[index]!==log.operationId||p.operationDigests[index]!==digest(log)){fail('billing-history-receipt-mismatch');return;}ready();}else if(p.previous)visit(p.previous);else fail('billing-orphan-receipt');},fail);
  if(!root.history){fail('billing-orphan-receipt');return;}visit(root.history);
}

/** Read a bounded journal suffix. Archived rows retain their original receipts
 * and remain checked on historical replay; no uncertain cost is compacted. */
function readBillingRoot(tx,check,ready,fail){
  const q=tx.objectStore('b23_states').get(billingRootKey);q.onsuccess=()=>{try{
    check();const current=q.result?validateRoot(unpack(q.result,billingRootKey)):emptyRoot(),logs=[];
    const done=()=>{try{check();logs.sort((a,b)=>a.sequence-b.sequence);for(let i=0;i<logs.length;i++)if(logs[i].sequence!==(current.history?.sequence??0)+i+1||logs[i].operationId!==current.operationIds[i]||i&&logs[i].beforeDigest!==logs[i-1].afterDigest)throw Error('billing-journal-chain-invalid');if(logs.length&&current.history&&logs[0].beforeDigest!==current.history.lastDigest)throw Error('billing-journal-chain-invalid');if(logs.length&&logs.at(-1).afterDigest!==stateDigest(current))throw Error('billing-journal-root-mismatch');ready(current,logs);}catch(e){fail(e.message);}};
    const load=()=>{if(!current.operationIds.length){done();return;}let left=current.operationIds.length;for(const id of current.operationIds){const key=billingOperationKey(id),r=tx.objectStore('b23_operations').get(key);r.onsuccess=()=>{try{check();if(!r.result)throw Error('billing-missing-journal');logs.push(validateLog(unpack(r.result,key)));if(!--left)done();}catch(e){fail(e.message);}};}};
    if(!q.result){
      let left=2;const done=()=>{if(!--left)load();},orphan=tx.objectStore('b23_operations').index('scopeKey').openCursor(billingRootKey);
      orphan.onsuccess=()=>{try{check();if(orphan.result)throw Error('billing-missing-root-with-history');done();}catch(e){fail(e.message);}};
      const prefix=JSON.stringify([billingRootKey]).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff'),retained=tx.objectStore('b23_states').openCursor(range);
      retained.onsuccess=()=>{try{check();const cursor=retained.result;if(!cursor){done();return;}if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix))throw Error('billing-missing-root-with-history');cursor.continue();}catch(e){fail(e.message);}};
    }
    else if(current.history)readBillingHistory(tx,current.history,check,load,fail);else load();
  }catch(e){fail(e.message);}};
}

function maintainFinalizedJobs(current,command,now){
  if(Object.keys(current.jobs).length<512)return {root:current,rows:[]};
  const excluded=new Set([command.jobId,command.checkpoint?.id]),final=new Set(Object.keys(current.jobs).filter(id=>!excluded.has(id)&&['committed','cancelled','stale','failed'].includes(current.jobs[id].checkpoint.state)).slice(0,-200));
  if(!final.size)return {root:current,rows:[]};
  const retained=Object.entries(current.ledger.reservations).filter(([,r])=>!final.has(r.reservation.jobId)).map(([id])=>id),archived=archiveFinalizedReservations(current.ledger,{now,retainReservationIds:retained});
  const activeReservationJobs=new Set(Object.values(archived.ledger.reservations).map(r=>r.reservation.jobId)),retire=[...final].filter(id=>!activeReservationJobs.has(id));
  if(!retire.length)return {root:current,rows:[]};
  const root=billingV2(clone(current));root.ledger=archived.ledger;const rows=[];
  const fences=new Map(root.archivedCreatedAtHighWater.map(row=>[JSON.stringify([row.billingProfileId,row.currency]),row]));
  for(const id of retire){const job=root.jobs[id],reservations=Object.entries(current.ledger.reservations).filter(([,r])=>r.reservation.jobId===id).map(([reservationId,row])=>({reservationId,row}));
    rows.push(envelope(billingArchivedJobKey(id),{format:'vaiwl-pro-billing-job-archive/1',scopeKey:billingRootKey,job:clone(job),reservations:clone(reservations)}));
    for(const {reservationId,row} of reservations){rows.push(envelope(billingArchivedReservationKey(reservationId),{format:'vaiwl-pro-billing-reservation-archive/1',scopeKey:billingRootKey,jobId:id,row:clone(row)}));if(row.reservation.status==='settled'&&row.reservation.actualCharge>0){const {billingProfileId,currency}=row.reservation,key=JSON.stringify([billingProfileId,currency]),old=fences.get(key);if(!old||Date.parse(row.createdAt)>Date.parse(old.through))fences.set(key,{billingProfileId,currency,through:row.createdAt});}}
    delete root.jobs[id];root.archivedJobCount++;
  }
  const totals=new Map(root.archivedSettledTotals.map(row=>[JSON.stringify([row.billingProfileId,row.currency]),row]));
  for(const row of archived.settledTotals){const key=JSON.stringify([row.billingProfileId,row.currency]),old=totals.get(key),sum=BigInt(old?.settled??0)+BigInt(row.settled);if(sum>BigInt(Number.MAX_SAFE_INTEGER))throw Error('money-overflow');totals.set(key,{...row,settled:Number(sum)});}
  root.archivedSettledTotals=[...totals.values()];root.archivedCreatedAtHighWater=[...fences.values()];return {root,rows};
}
function validateLog(input) {
  const log = boundedJSON(input, {maxBytes: 131072, maxNodes: 20000, maxDepth: 24});
  exact(log, ['format', 'scopeKey', 'operationId', 'sequence', 'fingerprint', 'actorScopeKey', 'action', 'beforeDigest', 'afterDigest', 'result']);
  if (log.format !== 'vaiwl-pro-billing-journal/1' || log.scopeKey !== billingRootKey) throw Error('billing-reader-incompatible');
  operationIdOK(log.operationId); integer(log.sequence); boundedText(log.actorScopeKey, 1024); boundedText(log.action, 64);
  for (const key of ['fingerprint', 'beforeDigest', 'afterDigest']) if (typeof log[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(log[key])) throw Error('invalid-billing-digest');
  if (log.result?.revision !== log.sequence) throw Error('invalid-billing-result');
  return log;
}
function checkpointRow(root, id, scope) {
  boundedText(id, 128); const row = root.jobs[id];
  if (!row) throw Error('missing-billing-job');
  if (row.scope.key !== scope.key || row.scope.persistence !== 'same-idb') throw Error('cross-scope-job-denied');
  return row;
}
function reservationRow(root, jobId) {
  const found = Object.values(root.ledger.reservations).find(row => row.reservation.jobId === jobId);
  if (!found) throw Error('missing-job-reservation');
  return found;
}
function cancelJob(root, jobId, reason) {
  const row = root.jobs[jobId], checkpoint = row.checkpoint;
  const reservation = Object.values(root.ledger.reservations).find(item => item.reservation.jobId === jobId)?.reservation;
  if (reservation?.status === 'reserved') root.ledger = releaseReservation(root.ledger, reservation.id, reservation.revision).ledger;
  row.checkpoint = transitionJob(checkpoint, {type: 'cancel', reason});
}

/** This reducer is deliberately private. Store clients cannot provide code,
 * generic patches, external effects or arbitrary writes. */
function applyCommand(current, command, scope, now) {
  let root = clone(current);const changedJobs = [];
  let detail = null;
  const rowFor = id => checkpointRow(root, id, scope);
  const configurePolicies=policies=>{
    if(policies.some(policy=>!root.ledger.policies[policy.id]&&(root.archivedCreatedAtHighWater??[]).some(fence=>fence.billingProfileId===policy.billingProfileId&&fence.currency===policy.currency&&Date.parse(policy.window?.from)<=Date.parse(fence.through))))throw Error('billing-archived-window-requires-current-start');
    root.ledger=configureBudgetPolicies(root.ledger,policies,root.ledger.revision);
  };
  switch (command.type) {
    case 'CONFIGURE_POLICIES': {
      exact(command, ['type', 'policies']);
      const affected = new Set(command.policies.filter(policy => {
        const old = root.ledger.policies[policy.id];
        return old && (policy.ceiling < old.ceiling || policy.pricingVersion !== old.pricingVersion);
      }).map(policy => policy.billingProfileId));
      configurePolicies(command.policies);
      // Tightening cannot leave an unsent reserved job eligible for dispatch.
      // Release its reservation and cancel; any future task requires new intent.
      for (const [jobId, row] of Object.entries(root.jobs)) {
        const reservation = Object.values(root.ledger.reservations).find(item => item.reservation.jobId === jobId)?.reservation;
        if (reservation && affected.has(reservation.billingProfileId) && reservation.status === 'reserved') {
          cancelJob(root, jobId, 'budget-tightened'); changedJobs.push(jobId);
        }
      }
      detail = {policyIds: command.policies.map(policy => policy.id)};
      break;
    }
    case 'CONFIGURE_USER_BUDGET':
    case 'ENSURE_USER_BUDGET_PERIODS': {
      exact(command,command.type==='CONFIGURE_USER_BUDGET'?['type','billingProfileId','currency','providerProfileId','pricingVersion','taskMaximumMicros','limits']:['type','billingProfileId','currency','providerProfileId','pricingVersion','taskMaximumMicros']);
      integer(command.taskMaximumMicros);const key=userBudgetKey(command.billingProfileId),previous=root.userBudgets?.[key];
      const limits=command.type==='CONFIGURE_USER_BUDGET'?validateUserBudgetLimits(command.limits):previous?.limits;
      if(!limits)throw Error('budget-zero');
      if(limits.taskMicros>command.taskMaximumMicros)throw Error('task-budget-exceeds-provider-maximum');
      if(previous&&(previous.currency!==command.currency||previous.providerProfileId!==command.providerProfileId))throw Error('billing-profile-currency-mismatch');
      if(Object.values(root.ledger.policies).some(p=>p.billingProfileId===command.billingProfileId&&(p.currency!==command.currency||p.providerProfileId!==command.providerProfileId)))throw Error('billing-profile-currency-mismatch');
      if(command.type==='ENSURE_USER_BUDGET_PERIODS'&&previous.pricingVersion!==command.pricingVersion)throw Error('budget-price-confirmation-required');
      const setting=validateUserBudget({billingProfileId:command.billingProfileId,currency:command.currency,providerProfileId:command.providerProfileId,pricingVersion:command.pricingVersion,
        revision:command.type==='CONFIGURE_USER_BUDGET'?(previous?.revision??0)+1:previous.revision,limits});
      const policies=userBudgetPolicies(setting,root.ledger,now).filter(p=>{const old=root.ledger.policies[p.id];return !old||old.ceiling!==p.ceiling||old.pricingVersion!==p.pricingVersion;});
      if(policies.length)configurePolicies(policies);
      root=billingV3(root);root.userBudgets[key]=setting;
      if(command.type==='CONFIGURE_USER_BUDGET')for(const [jobId,row]of Object.entries(root.jobs)){
        const reservation=Object.values(root.ledger.reservations).find(item=>item.reservation.jobId===jobId)?.reservation;
        if(reservation?.billingProfileId===setting.billingProfileId&&reservation.status==='reserved'){cancelJob(root,jobId,'budget-changed');changedJobs.push(jobId);}
      }
      detail={budgetKey:key,settingRevision:setting.revision};break;
    }
    case 'QUEUE_JOB': {
      exact(command, ['type', 'checkpoint']); const checkpoint = validateJob(command.checkpoint);
      if (!['queued', 'paused'].includes(checkpoint.state)) throw Error('new-job-must-be-unsent');
      if (checkpoint.inputVersions?.scopeKey !== scope.key && checkpoint.state === 'queued') throw Error('cross-scope-job-denied');
      if (root.jobs[checkpoint.id] && root.jobs[checkpoint.id].scope.key !== scope.key) throw Error('cross-scope-job-denied');
      const admitted = admitJob(Object.values(root.jobs).filter(row => row.scope.key === scope.key).map(row => row.checkpoint), checkpoint);
      if (admitted.admitted) { root.jobs[checkpoint.id] = {scope: clone(scope), checkpoint}; changedJobs.push(checkpoint.id); }
      detail = {jobId: admitted.checkpoint.id, admitted: admitted.admitted};
      break;
    }
    case 'RESERVE_JOB': {
      exact(command, ['type', 'jobId', 'reservationId', 'maximum', 'billingProfileId', 'providerProfileId', 'currency', 'priceCardVersion', 'expectedBudgetRevisions']);
      const row = rowFor(command.jobId);
      if (row.checkpoint.state !== 'queued' || !row.checkpoint.modelBinding || row.checkpoint.modelBinding.priceCardVersion !== command.priceCardVersion) throw Error('job-not-reservable');
      const chosen=root.userBudgets?.[userBudgetKey(command.billingProfileId)];
      if(chosen){
        if(chosen.currency!==command.currency||chosen.providerProfileId!==command.providerProfileId||chosen.pricingVersion!==command.priceCardVersion)throw Error('budget-price-confirmation-required');
        if(chosen.limits.taskMicros===0||command.maximum>chosen.limits.taskMicros)throw Error('task-budget-exceeded');
        const usage=userBudgetUsage(root.ledger,{billingProfileId:command.billingProfileId,currency:command.currency,now});
        for(const kind of ['day','month'])if(BigInt(usage[kind+'Micros'])+BigInt(command.maximum)>BigInt(chosen.limits[kind+'Micros']))throw Error('budget-exceeded');
      }
      const reserved = reserveBudget(root.ledger, {id: command.reservationId, jobId: command.jobId, scope,
        billingProfileId: command.billingProfileId, providerProfileId: command.providerProfileId, currency: command.currency,
        priceCardVersion: command.priceCardVersion, maximum: command.maximum, expectedBudgetRevisions: command.expectedBudgetRevisions, now});
      root.ledger = reserved.ledger; row.checkpoint = transitionJob(row.checkpoint, {type: 'reserve', reservationId: command.reservationId});
      detail = {reservation: reserved.reservation}; changedJobs.push(command.jobId);
      break;
    }
    case 'DISPATCH_JOB': {
      exact(command, ['type', 'jobId']); const row = rowFor(command.jobId);
      if (Object.values(root.jobs).some(item => item.checkpoint.state === 'dispatched')) throw Error('installation-model-concurrency-limit');
      if (row.checkpoint.modelBinding) {
        const reservation = reservationRow(root, command.jobId).reservation;
        root.ledger = markBudgetDispatched(root.ledger, reservation.id, reservation.revision,null,{now}).ledger;
      }
      row.checkpoint = transitionJob(row.checkpoint, {type: 'dispatch'}); changedJobs.push(command.jobId);
      detail = {checkpoint: row.checkpoint, networkDispatched: false};
      break;
    }
    case 'COMPLETE_JOB': {
      exact(command, ['type', 'jobId', 'resultDigest', 'actualCharge', 'reportedExactChargeDecimal']);
      const row = rowFor(command.jobId);
      if (row.checkpoint.state !== 'dispatched') throw Error('job-result-not-expected');
      if (row.checkpoint.modelBinding) {
        const reservation = reservationRow(root, command.jobId).reservation;
        const settled = settleReservation(root.ledger, reservation.id, reservation.revision,
          {actualCharge: command.actualCharge, reportedExactChargeDecimal: command.reportedExactChargeDecimal});
        root.ledger = settled.ledger;
        detail = {exceededReservation: settled.exceededReservation};
      } else if (command.actualCharge !== 0 || command.reportedExactChargeDecimal !== null) throw Error('local-job-cannot-charge');
      row.checkpoint = transitionJob(row.checkpoint, {type: 'result', resultDigest: command.resultDigest}); changedJobs.push(command.jobId);
      break;
    }
    case 'ADVANCE_RESULT': {
      exact(command, ['type', 'jobId', 'event']); const row = rowFor(command.jobId);
      if (command.event.type === 'validate') exact(command.event, ['type', 'currentVersions', 'awaitingReview', 'proposalId']);
      else if (command.event.type === 'commit') exact(command.event, ['type', 'operationId']);
      else throw Error('result-event-not-allowed');
      row.checkpoint = transitionJob(row.checkpoint, command.event); changedJobs.push(command.jobId);
      break;
    }
    case 'CANCEL_JOB': {
      exact(command, ['type', 'jobId', 'reason']); rowFor(command.jobId); boundedText(command.reason, 200);
      cancelJob(root, command.jobId, command.reason); changedJobs.push(command.jobId);
      detail = {checkpoint: root.jobs[command.jobId].checkpoint};
      break;
    }
    case 'RECONCILE_CHARGE': {
      exact(command, ['type', 'jobId', 'actualCharge', 'reportedExactChargeDecimal']);
      const row = rowFor(command.jobId), reservation = reservationRow(root, command.jobId).reservation;
      if (!['outcome-unknown', 'dispatched'].includes(row.checkpoint.state)) throw Error('job-not-uncertain');
      const settled = settleReservation(root.ledger, reservation.id, reservation.revision,
        {actualCharge: command.actualCharge, reportedExactChargeDecimal: command.reportedExactChargeDecimal});
      root.ledger = settled.ledger;
      row.checkpoint = validateJob({state: 'cancelled', id: row.checkpoint.id, inputFingerprint: row.checkpoint.inputFingerprint,
        modelBinding: row.checkpoint.modelBinding, reason: 'charge-reconciled-no-result-replay'});
      changedJobs.push(command.jobId); detail = {exceededReservation: settled.exceededReservation};
      break;
    }
    case 'RECONCILE_NO_CHARGE': {
      exact(command, ['type', 'jobId']); const row = rowFor(command.jobId), reservation = reservationRow(root, command.jobId).reservation;
      if (!['outcome-unknown', 'dispatched'].includes(row.checkpoint.state)) throw Error('job-not-uncertain');
      root.ledger = releaseReservation(root.ledger, reservation.id, reservation.revision, {providerConfirmedNoCharge: true}).ledger;
      row.checkpoint = validateJob({state: 'cancelled', id: row.checkpoint.id, inputFingerprint: row.checkpoint.inputFingerprint,
        modelBinding: row.checkpoint.modelBinding, reason: 'provider-confirmed-no-charge'});
      changedJobs.push(command.jobId);
      break;
    }
    case 'RECOVER_SCOPE': {
      exact(command, ['type']); const actions = [];
      for (const [id, row] of Object.entries(root.jobs)) if (row.scope.key === scope.key) {
        const recovered = recoverJob(row.checkpoint, {scope, authorized: false});
        if (digest(row.checkpoint) !== digest(recovered.checkpoint)) { row.checkpoint = recovered.checkpoint; changedJobs.push(id); }
        actions.push({jobId: id, action: recovered.action, automaticDispatch: false});
      }
      detail = {actions, automaticDispatch: false};
      break;
    }
    default: throw Error('unsupported-billing-command');
  }
  return {root, result: {changedJobs, detail}};
}

export function createSameDatabaseBillingStore({connection, verifyAuthority,verifyDispatchFence=null, enabled = false, clock = () => new Date().toISOString()} = {}) {
  if (typeof connection !== 'function' || typeof verifyAuthority !== 'function' || typeof clock !== 'function'||verifyDispatchFence!==null&&typeof verifyDispatchFence!=='function') throw Error('billing-shared-owner-required');
  function guard(authority, intent, signal) {
    if (!enabled) throw Error('billing-integration-disabled');
    if (signal?.aborted) throw Error('aborted');
    // No structural check of a caller grant can replace this owner callback.
    // It must resolve the exact RAM object and authorize the requested action,
    // including separate admin/billing/reconciliation capabilities as applicable.
    const resolved = verifyAuthority(authority, intent);
    if (resolved?.then) { try { Promise.prototype.then.call(resolved, () => {}, () => {}); } catch {} throw Error('async-billing-authority-denied'); }
    const scope = validateSourceScope(resolved);
    if (scope.persistence !== 'same-idb') throw Error('billing-persistent-scope-required');
    return clone(scope);
  }
  async function read(authority, signal) {
    const initialScope = guard(authority, {action: 'READ_BILLING', phase: 'before-connection'}, signal), db = assertRegisteredProDatabase(await connection());
    if (stable(guard(authority, {action: 'READ_BILLING', phase: 'before-transaction'}, signal)) !== stable(initialScope)) throw Error('billing-authority-scope-changed');
    return new Promise((resolve, reject) => {
      let tx, current, failure, logs = [];
      const fail = error => { failure = error; try { tx?.abort(); } catch {} };
      const check = () => { const scope = guard(authority, {action: 'READ_BILLING', phase: 'inside-transaction'}, signal); if (stable(scope) !== stable(initialScope)) throw Error('billing-authority-scope-changed'); };
      const abort = () => fail(Error('aborted'));
      try {
        tx = db.transaction(STORES, 'readonly'); signal?.addEventListener('abort', abort, {once: true});
        readBillingRoot(tx,check,(root,records)=>{current=root;logs=records;},reason=>fail(Error(reason)));
        tx.oncomplete = () => {
          signal?.removeEventListener('abort', abort);
          try {
            check();
            if(!current)throw Error('billing-read-no-result');
            resolve({revision: current.revision, ledger: clone(current.ledger), jobs: clone(current.jobs), records: logs,userBudgets:clone(current.userBudgets??{}),
              archivedJobCount:current.archivedJobCount??0,archivedSettledTotals:clone(current.archivedSettledTotals??[])});
          } catch (error) { reject(error); }
        };
        tx.onabort = () => { signal?.removeEventListener('abort', abort); reject(failure ?? tx.error ?? Error('billing-read-aborted')); };
        tx.onerror = () => {};
      } catch (error) { signal?.removeEventListener('abort', abort); reject(error); }
    });
  }
  async function transact(authority, request, signal) {
    const input = boundedJSON(request, {maxBytes: 131072, maxNodes: 20000, maxDepth: 24});
    exact(input, ['operationId', 'expectedRevision', 'command']); operationIdOK(input.operationId); integer(input.expectedRevision);
    boundedText(input.command?.type, 64);
    const fingerprint = digest(input), intent = {action: input.command.type, operationId: input.operationId, command: clone(input.command)};
    const initialScope = guard(authority, {...intent, phase: 'before-connection'}, signal), db = assertRegisteredProDatabase(await connection());
    const priorScope = guard(authority, {...intent, phase: 'before-transaction'}, signal);
    if (stable(priorScope) !== stable(initialScope)) throw Error('billing-authority-scope-changed');
    return new Promise(resolve => {
      let tx, outcome = null, finished = false;
      const fail = reason => { if (finished) return; outcome = {ok: false, reason}; try { tx?.abort(); } catch {} };
      const check = (root = null) => {
        try {
          const scope = guard(authority, {...intent, phase: 'inside-transaction',
            job: input.command.jobId && root ? clone(root.jobs[input.command.jobId] ?? null) : null}, signal);
          if (stable(scope) !== stable(initialScope)) throw Error('billing-authority-scope-changed'); return scope;
        } catch (error) { fail(error.message); return null; }
      };
      const abort = () => fail('aborted');
      try {
        tx = db.transaction(STORES, 'readwrite'); signal?.addEventListener('abort', abort, {once: true});
        const opKey = billingOperationKey(input.operationId), logRequest = tx.objectStore('b23_operations').get(opKey);
        logRequest.onsuccess = () => {
          if (!check()) return;
          try {
            if (logRequest.result) {
              const old = validateLog(unpack(logRequest.result, opKey));
              if (old.fingerprint !== fingerprint || old.actorScopeKey !== initialScope.key) { fail('billing-operation-replay-conflict'); return; }
              readBillingRoot(tx,()=>{if(!check())throw Error('billing-authority-invalidated');},root=>{
                proveBillingLog(tx,root,old,()=>{if(!check())throw Error('billing-authority-invalidated');},()=>{outcome={ok:true,value:clone(old.result),replayed:true};},fail);
              },fail);
              return;
            }
            readBillingRoot(tx,()=>{if(!check())throw Error('billing-authority-invalidated');},(current,logs)=>{
              const apply=()=>{try {
                if (current.revision !== input.expectedRevision) throw Error('billing-revision-conflict');
                const scope = check(current); if (!scope) return;
                const now=clock(),maintenance=maintainFinalizedJobs(current,input.command,now);
                const reduced = applyCommand(maintenance.root, input.command, scope, now);
                const sequence = current.revision + 1;
                const page=current.operationIds.length>=JOURNAL_WINDOW?billingHistoryPage(current,logs):null;
                let base=page?billingV2(reduced.root):reduced.root;
                if(page)base={...base,history:{number:page.payload.number,sequence:page.payload.sequence,checksum:page.checksum,lastDigest:page.payload.lastDigest},operationIds:[]};
                const next = validateRoot({...base, revision: sequence, operationIds: [...base.operationIds, input.operationId]});
                const result = {...reduced.result, revision: sequence, ledgerRevision: next.ledger.revision};
                const log = validateLog({format: 'vaiwl-pro-billing-journal/1', scopeKey: billingRootKey, operationId: input.operationId,
                  sequence, fingerprint, actorScopeKey: scope.key, action: input.command.type,
                  beforeDigest: stateDigest(current), afterDigest: stateDigest(next), result});
                if (!check(current)) return;
                for(const row of [...maintenance.rows,...(page?[page]:[])]){const write=tx.objectStore('b23_states').add(row);write.onsuccess=()=>{check(current);};}
                const stateWrite = tx.objectStore('b23_states').put(envelope(billingRootKey, next)); stateWrite.onsuccess = () => { check(current); };
                const logWrite = tx.objectStore('b23_operations').put(envelope(opKey, log)); logWrite.onsuccess = () => { check(current); };
                if (!check(current)) return;
                outcome = {ok: true, value: clone(result), replayed: false};
              } catch (error) { fail(error.message); }};
              const dispatchFenced=()=>{try{
                if(input.command.type!=='DISPATCH_JOB'||verifyDispatchFence===null){apply();return;}
                const scope=check(current);if(!scope)return;const row=checkpointRow(current,input.command.jobId,scope);let entered=false;
                const ready=()=>{if(entered){fail('billing-dispatch-fence-reentered');return;}entered=true;if(check(current))apply();};
                const returned=verifyDispatchFence(tx,scope,clone(row.checkpoint),()=>Boolean(check(current)),ready,fail);
                if(returned?.then){try{Promise.prototype.then.call(returned,()=>{},()=>{});}catch{}throw Error('async-billing-dispatch-fence-denied');}
              }catch(e){fail(e.message);}};
              const archiveKey=input.command.type==='QUEUE_JOB'?billingArchivedJobKey(input.command.checkpoint?.id):input.command.type==='RESERVE_JOB'?billingArchivedReservationKey(input.command.reservationId):null;
              if(archiveKey){const retired=tx.objectStore('b23_states').get(archiveKey);retired.onsuccess=()=>{if(!check(current))return;if(retired.result){fail(input.command.type==='QUEUE_JOB'?'billing-retired-job-id':'billing-retired-reservation-id');return;}dispatchFenced();};}else dispatchFenced();
            },fail);
          } catch (error) { fail(error.message); }
        };
        tx.oncomplete = () => {
          finished = true; signal?.removeEventListener('abort', abort);
          try { const scope = guard(authority, {...intent, phase: 'after-commit'}, signal); if (stable(scope) !== stable(initialScope)) throw Error('scope-changed');
            resolve(outcome ?? {ok: false, reason: 'billing-no-result'});
          } catch { resolve({ok: false, reason: 'billing-stale-after-commit', committed: true}); }
        };
        tx.onabort = () => { finished = true; signal?.removeEventListener('abort', abort);
          resolve(outcome?.ok === false ? outcome : {ok: false, reason: tx.error?.name ?? 'billing-transaction-aborted'}); };
        tx.onerror = () => {};
      } catch (error) { signal?.removeEventListener('abort', abort); fail(error.message); resolve({ok: false, reason: error.message}); }
    });
  }
  async function readArchivedJob(authority,jobId,signal){
    boundedText(jobId,128);const intent={action:'READ_BILLING',jobId},scope=guard(authority,{...intent,phase:'before-connection'},signal),db=assertRegisteredProDatabase(await connection());
    const check=()=>{if(stable(guard(authority,{...intent,phase:'inside-transaction'},signal))!==stable(scope))throw Error('billing-authority-scope-changed');};check();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORES,'readonly');let answer,failure;
      const fail=reason=>{failure=Error(reason);try{tx.abort();}catch{};},abort=()=>fail('aborted');signal?.addEventListener('abort',abort,{once:true});
      readBillingRoot(tx,check,root=>{
        const key=billingArchivedJobKey(jobId),q=tx.objectStore('b23_states').get(key);q.onsuccess=()=>{try{
          check();if(!q.result){answer=null;return;}const p=unpack(q.result,key);exact(p,['format','scopeKey','job','reservations']);exact(p.job,['scope','checkpoint']);validateSourceScope(p.job.scope);validateJob(p.job.checkpoint);
          if(p.format!=='vaiwl-pro-billing-job-archive/1'||p.scopeKey!==billingRootKey||p.job.scope.key!==scope.key||p.job.scope.persistence!=='same-idb'||p.job.checkpoint.id!==jobId)throw Error('cross-scope-archived-job-denied');
          if(!['committed','cancelled','stale','failed'].includes(p.job.checkpoint.state))throw Error('billing-archive-corrupt');
          if(!Array.isArray(p.reservations)||p.reservations.length>1)throw Error('billing-archive-corrupt');
          for(const entry of p.reservations){exact(entry,['reservationId','row']);const ledger={...root.ledger,reservations:{[entry.reservationId]:entry.row}};validateBudgetLedger(ledger);if(entry.row.scopeKey!==scope.key||entry.row.reservation.jobId!==jobId||!['settled','released'].includes(entry.row.reservation.status))throw Error('billing-archive-corrupt');}
          answer={job:clone(p.job),reservations:clone(p.reservations)};
        }catch(e){fail(e.message);}};
      },fail);
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);try{check();if(answer===undefined)throw Error('billing-history-no-result');resolve(answer);}catch(e){reject(e);}};
      tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('billing-history-read-aborted'));};tx.onerror=()=>{};
    });
  }
  return Object.freeze({read, readArchivedJob,transact});
}
