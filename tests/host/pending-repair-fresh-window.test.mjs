import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {waitPendingRepairFreshWindow} from './existing-source-pending-repair-journey.mjs';
import {pendingDiagnosticError} from './existing-source-pending-repair-oracle.mjs';
const budget={checksumValid:true,startedAt:1000,lastAt:1001,requests:3,attemptCounts:[1]};
test('old single sleep can fail on early wake; actual fresh-window callback rechecks unchanged boundary',async()=>{
 let wall=30000,tick=0,calls=0;const original=structuredClone(budget);
 const earlySleep=async ms=>{const elapsed=calls++===0?ms-1:ms;wall+=elapsed;tick+=elapsed;};
 await earlySleep(budget.startedAt+30001-wall);assert.equal(wall,31000);assert.throws(()=>assert(wall>budget.startedAt+30000));
 wall=30000;tick=0;calls=0;await waitPendingRepairFreshWindow(budget,{now:()=>wall,monotonicNow:()=>tick,sleep:earlySleep});assert(wall>31000);assert(calls>=2);assert.deepEqual(budget,original);
});
for(const [patch,label]of [[{checksumValid:false},'CHECKSUM'],[{lastAt:0},'TIMESTAMPS'],[{requests:13},'REQUESTS'],[{attemptCounts:[4]},'ATTEMPTS']])test('budget failure has fixed private-safe label '+label,async()=>{await assert.rejects(waitPendingRepairFreshWindow({...budget,...patch}),error=>{const result=pendingDiagnosticError(error);assert.equal(result.assertionLabel,'PENDING_REPAIR_BUDGET_'+label);assert.equal(result.stack,null);return true;});});
test('first-send stages and durable pre-wait diagnostic survive an early budget failure',async()=>{const s=await readFile(new URL('./existing-source-pending-repair-journey.mjs',import.meta.url),'utf8');assert(s.includes("stage('FIRST_SEND_BUDGET');const preparation=await preparePendingRepairLease("));assert(s.includes("stage('FIRST_SEND_ACK_READ');const first=await poll("));assert(s.includes('report.budgetObservations=budgetObservations;'));assert(s.includes('budgetObservations.push(budget);const waitMs=await waitPendingRepairFreshWindow(budget)'));assert(s.includes("'fixtures/budget-expiry-wait.mjs'"));});
test('fresh-window actual callback rejects backward monotonic time',async()=>{let tick=1;await assert.rejects(waitPendingRepairFreshWindow(budget,{now:()=>2000,monotonicNow:()=>tick--,sleep:async()=>{throw Error('must-not-sleep');}}),/invalid-budget-clock/);});
test('late wake cannot become a success after independent monotonic deadline',async()=>{let wall=30000,tick=0;await assert.rejects(waitPendingRepairFreshWindow(budget,{now:()=>wall,monotonicNow:()=>tick,sleep:async()=>{wall=40000;tick=10000;}}),/budget-expiry-deadline/);});
test('expired window does not reset or rewrite even exhausted counters',async()=>{const exhausted={...budget,requests:12,attemptCounts:[3]},before=structuredClone(exhausted);assert.equal(await waitPendingRepairFreshWindow(exhausted,{now:()=>31001,monotonicNow:()=>0,sleep:async()=>{throw Error('must-not-sleep');}}),0);assert.deepEqual(exhausted,before);});
