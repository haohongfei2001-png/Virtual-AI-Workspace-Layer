import assert from 'node:assert/strict';
import {waitForBudgetExpiry} from './fixtures/budget-expiry-wait.mjs';
/** Schedule a new ordinary foreground read after the observed production window.
 * Does not alter persisted budget, retries, clocks or the observation deadline. */
export async function waitJ2ReopenBudget(budget,{wait=waitForBudgetExpiry,now=Date.now}={}){
 assert(Array.isArray(budget)&&budget.length>0,'missing-J2-observed-read-budget');
 const startedAt=budget.map(row=>{assert(Number.isFinite(row.startedAt),'invalid-J2-budget-start');return row.startedAt;});
 const latest=Math.max(...startedAt),began=now();
 const waitedMs=await wait(latest);const finished=now();
 assert(Number.isFinite(finished)&&finished>latest+30000,'J2-read-budget-has-not-expired');
 return {observedWindowStartedAt:latest,startedAt:began,finishedAt:finished,waitedMs,windowMs:30000,budgetReset:false,authority:'ORDINARY_NATIVE_REOPEN_AFTER_REAL_WINDOW_EXPIRY'};
}
