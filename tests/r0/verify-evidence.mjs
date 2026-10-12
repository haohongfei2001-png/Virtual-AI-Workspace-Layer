import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'docs/experiments/results/r0-live-2026-10-12');
const json=p=>JSON.parse(readFileSync(resolve(out,p),'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const first=json('guest-journey-first/results.json'),supp=json('guest-supplement/results.json');
assert.deepEqual(first.counts,{PASS:8,FAIL:2});assert.deepEqual(supp.counts,{PASS:6,FAIL:0});
assert.equal(json('guest-first-message.json').sentCount+first.additionalSyntheticSendAttempts+supp.additionalMessagesSent,3);
assert(first.tests.some(t=>t.status==='FAIL'&&/refresh/.test(t.id)));
assert(first.tests.some(t=>t.status==='FAIL'&&/browser-back/.test(t.id)));
assert(first.workerEvents.some(e=>e.status==='stopped'));
const cold=first.tests.find(t=>/actual-worker-stop-restart/.test(t.id)).actual;
assert(cold.actualStoppedEvent&&cold.noPageReload&&cold.beforeBoot!==cold.afterBoot);
for(const [path,wanted] of Object.entries(first.buildHashes))if(path!=='manifest.json')assert.equal(hash(path),wanted,path);
const archives={'experiments/r0/structure.js':'guest-journey-first/structure.executed.js','tests/r0/live-guest-journey.py':'guest-journey-first/driver.executed.py'};
for(const [path,wanted] of Object.entries(first.sourceHashes))assert.equal(hash(archives[path]?'docs/experiments/results/r0-live-2026-10-12/'+archives[path]:path),wanted,path);
for(const [path,wanted] of Object.entries(supp.sourceHashes))assert.equal(hash(archives[path]&&path.includes('live-guest-journey')?'docs/experiments/results/r0-live-2026-10-12/'+archives[path]:path),wanted,path);
for(const test of [...first.tests,...supp.tests]){
 const h=test.actual.health??test.actual.probeHealth??test.actual.probe;
 if(h){assert.equal(h.trustedAccountScope,false);assert.equal(h.derivedContentEnabled,false);assert.equal(h.dataStoreOpened,false);assert.equal(h.nativeWritesEnabled,false);}
 if(test.actual.time)assert.equal(test.actual.time.originalSendTime,'UNKNOWN');
}
const changes=execFileSync('git',['diff','--name-only',json('BASELINE.json').sourceBase,'--','src','simulator','package.json','design'],{cwd:root,encoding:'utf8'});assert.equal(changes.trim(),'');
const files=[];function walk(p){for(const e of readdirSync(resolve(out,p),{withFileTypes:true})){const path=p+'/'+e.name;if(e.isDirectory())walk(path);else files.push(path);}}walk('.');
for(const p of files.filter(p=>/\.(json|md|log)$/.test(p))){const s=readFileSync(resolve(out,p),'utf8');assert(!/Bearer\s+[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{30,}|"(?:access_token|refresh_token|cookie|sessionToken)"\s*:|https:\/\/chatgpt\.com\/(?:c\/|g\/)|chrome-extension:\/\//.test(s),p);}
console.log(JSON.stringify({status:'PASS',actualGuestMessages:3,initialRawFailuresPreserved:2,initialRawPassCount:8,supplementalPassCount:6,actualWorkerStopAndBootChange:true,executedProbeAndArchivedDriverHashesMatch:true,productionCoreUnchanged:true,credentialAndLiveIdentifierPatternScan:true,scanLimit:'pattern scan plus manually reviewed screenshots; not universal secrecy proof'}));
