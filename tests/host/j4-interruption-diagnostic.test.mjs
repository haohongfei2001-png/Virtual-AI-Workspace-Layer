import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {interruptionRequestFacts} from './j4-evidence-interruption.mjs';
test('request diagnostic is bounded and excludes fixture body, principal and credentials',()=>{
 const source={interruption:{accepts:1,held:true,pending:0,rows:[{id:'private',author:'principal',text:'body'}],reads:Array.from({length:70},(_,i)=>({authenticatedWorker:true,held:i>60,receivedAt:i,finishedAt:i>60?null:i+1,token:'secret',path:'/private'}))}};
 const before=structuredClone(source),facts=interruptionRequestFacts(source);assert.equal(facts.reads.length,64);assert.equal(facts.reads[0].receivedAt,6);assert.equal(facts.rowCount,1);assert.deepEqual(source,before);for(const forbidden of ['private','principal','secret','token','path','body'])assert(!JSON.stringify(facts).includes(forbidden));assert.equal(interruptionRequestFacts({}),null);
});
test('timeout diagnostics preserve real hold predicate and timeout without resetting budget',async()=>{
 const s=await readFile(new URL('./j4-evidence-interruption.mjs',import.meta.url),'utf8'),runner=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 for(const token of ['Date.now()+15000','s.accepts===1&&s.pending>0','authenticated-detail-hold-timeout','throw error;','baseline-before-native-send',"db.transaction('b23_views','readonly')",'attemptCounts:p.attempts?.map(a=>a.count)'])assert(s.includes(token),token);
 assert(!s.includes("'readwrite'"));assert(runner.includes('report.interruptionDiagnostics??=[]'));
 assert(s.indexOf("capture('baseline-before-native-send')")<s.indexOf("fill('J4 explicit native interruption send')"));
});

test('baseline failure is diagnosed before any native send without bypass or retry',async()=>{
 const s=await readFile(new URL('./j4-evidence-interruption.mjs',import.meta.url),'utf8');
 const start=s.indexOf("await capture('baseline-current-body-visible-before-observation')"),failure=s.indexOf("await capture('baseline-original-history-timeout')"),send=s.indexOf("fill('J4 explicit native interruption send')");
 assert(start>=0&&start<failure&&failure<send);assert(s.slice(failure,send).includes('throw error;'));assert(s.slice(start,failure).includes("try{await poll(async()=>events(await evidence()).some(e=>e.messageId==='j4_original_old'))"));
 assert(s.includes('readingConversationMatches:'));assert(s.includes('scopeKnown:'));
});
