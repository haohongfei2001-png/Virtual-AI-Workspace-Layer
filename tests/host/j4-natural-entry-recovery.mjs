import assert from 'node:assert/strict';
import {waitForBudgetExpiry} from './fixtures/budget-expiry-wait.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
/** Offline follow-up only. Does not turn the original immediate recovery failure into PASS. */
export async function runJ4NaturalEntryRecovery({budget,readEvidence,enter,readActions,expectedMessageId,expectedConversationId,expectedSentAt,expectedScopeKey,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 assert(budget?.present===true&&budget.checksumValid===true,'valid-original-budget-required');assert.equal(budget.requests,12);assert.equal(budget.requestLimit,12);assert.equal(budget.windowMs,30000);assert(Number.isFinite(budget.startedAt)&&Number.isFinite(budget.lastAt)&&budget.lastAt>=budget.startedAt&&budget.lastAt<budget.startedAt+30000,'invalid-original-window');
 for(const fn of [readEvidence,enter,readActions,now,wait])assert.equal(typeof fn,'function');for(const value of [expectedMessageId,expectedConversationId,expectedSentAt,expectedScopeKey])assert.equal(typeof value,'string');assert(Number.isFinite(Date.parse(expectedSentAt)));
 const originalBudget=structuredClone(budget);assert.equal(await readActions(),1,'native-send-count-before-recovery');
 const waitedMs=await waitForBudgetExpiry(originalBudget.startedAt,{now,sleep:wait});assert(now()>originalBudget.startedAt+30000,'original-budget-not-expired');
 const started=now(),abort=new AbortController();let active=true,last=started,entries=0;
 const check=()=>{const at=now();assert(active&&!abort.signal.aborted&&Number.isFinite(at)&&at>=last&&at-started<15000,'natural-entry-recovery-deadline');last=at;};
 const rows=value=>{assert(value?.events&&typeof value.events==='object'&&!Array.isArray(value.events),'invalid-evidence-state');return Object.values(value.events).filter(e=>e.messageId===expectedMessageId);};
 const validate=(matches,state)=>{assert.equal(matches.length,1,'expected-one-original-event');const event=matches[0];assert.equal(event.conversationId,expectedConversationId);assert.equal(event.sentAt,expectedSentAt);assert.equal(event.sendState,'committed');assert.equal(event.actorVerified,true);assert.equal(event.actorScopeKey,expectedScopeKey);assert.equal(event.revoked,false);const source=state.sources?.[event.sourceId];assert(source,'missing-event-source');assert.equal(source.revoked,false);assert.equal(source.channel,'host-evidence');assert.equal(source.codecVersion,2);assert.equal(typeof source.generation,'string');const generation=/^profile_([1-9][0-9]*)(?:_recovery_([1-9][0-9]*))?$/.exec(source.generation);assert(generation,'invalid-host-source-generation');assert(Number.isSafeInteger(Number(generation[1]))&&Number(generation[1])===source.profileVersion,'invalid-host-source-profile-generation');if(generation[2])assert(Number.isSafeInteger(Number(generation[2]))&&Number(generation[2])<20000,'invalid-host-source-recovery-generation');assert.equal(event.generation,source.generation);return event;};
 try{return await withRequestDeadline(async()=>{
  check();const prior=await readEvidence();check();const beforeEntry=structuredClone(rows(prior));if(beforeEntry.length)validate(beforeEntry,prior);
  assert.equal(await readActions(),1,'native-send-count-before-entry');check();entries++;await enter({remainingMs:()=>{check();return 15000-(last-started);},signal:abort.signal,isCurrent:()=>{try{check();return true;}catch{return false;}}});check();
  for(let attempts=0;attempts<151;attempts++){
   check();const current=await readEvidence();check();const matches=rows(current);assert.equal(await readActions(),1,'native-send-replayed');check();
   if(matches.length){const event=validate(matches,current);return {evidence:'NATURAL_ENTRY_AFTER_BUDGET_NOT_IMMEDIATE_RECOVERY',status:'PASS_NATURAL_ENTRY_ONLY',immediateRecovery:'UNCHANGED_ORIGINAL_FAILURE',originalBudget,waitedMs,beforeEntry,event:structuredClone(event),source:structuredClone(current.sources?.[event.sourceId]??null),entryCalls:entries,nativeAccepts:1,elapsedAfterBudgetMs:now()-started,causality:beforeEntry.length?'EVENT_ALREADY_PRESENT_BEFORE_ENTRY':'EVENT_OBSERVED_AFTER_ENTRY'};}
   const remaining=15000-(now()-started);assert(remaining>0,'natural-entry-recovery-deadline');await wait(Math.min(100,remaining));check();
  }
  throw Error('natural-entry-recovery-clock-stalled');
 },{timeoutMs:15000,now});}finally{active=false;abort.abort();}
}
