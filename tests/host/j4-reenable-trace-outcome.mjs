import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function assertJ4ReenableTraceOutcome(report,{exitCode,sourceCommit}={}){
 const kind='DIAGNOSTIC_ONLY_J4_REENABLE_OWNER_TRACE',paths=['src/runtime/browser-request-context.mjs','src/runtime/host-browser-bootstrap.mjs','extension/worker.mjs','extension/classic-runtime.js'];
 assert.equal(exitCode,2);assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);
 assert.equal(report.status,kind);assert.equal(report.evidence,kind);assert.equal(report.sourceCommit,sourceCommit);
 assert(['FRESH_GRANT_OBSERVED','FRESH_GRANT_TIMEOUT'].includes(report.boundaryOutcome));assert.equal(report.lifecycleOrderInstrumentation?.kind,kind);
 const changes=report.lifecycleOrderInstrumentation.changes;assert(Array.isArray(changes));assert.equal(changes.length,4);assert.deepEqual(changes.map(c=>c.path).sort(),[...paths].sort());
 for(const c of changes){assert.match(c.originalSha256,/^[a-f0-9]{64}$/);assert.match(c.instrumentedSha256,/^[a-f0-9]{64}$/);assert.notEqual(c.originalSha256,c.instrumentedSha256);}
 assert.equal(report.lifecycleOrderPackageUnchanged,true);assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);
 assert.equal(report.ownerTrace?.causalConclusion,'NOT_ESTABLISHED');assert.equal(typeof report.ownerTrace?.complete,'boolean');
 return {status:kind,boundaryOutcome:report.boundaryOutcome,diagnosticComplete:report.ownerTrace.complete,formalAcceptance:'NOT_ESTABLISHED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [path,code,sha]=process.argv.slice(2);console.log(JSON.stringify(assertJ4ReenableTraceOutcome(JSON.parse(await readFile(path,'utf8')),{exitCode:Number(code),sourceCommit:sha})));}
