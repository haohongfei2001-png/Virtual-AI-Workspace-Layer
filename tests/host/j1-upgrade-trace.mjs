import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const path='src/host/content-session.mjs';
// DIAGNOSTIC_ONLY: fixed labels and booleans only. Stack frames are reduced to
// public function labels; raw URLs, identifiers, source, arguments never leave RAM.
export const J1_UPGRADE_RECORDER=`
let __j1UpgradeTraceCount=0;
const __j1UpgradeTrace=(stage,flags={},rawStack=null)=>{try{
 if(__j1UpgradeTraceCount>=128)return;
 const row={kind:'DIAGNOSTIC_ONLY',stage};
 for(const key of ['identity','display','routeChanged','projectAcknowledged','preview','pendingHandle','pendingValid','known','resolved'])if(typeof flags[key]==='boolean')row[key]=flags[key];
 if(rawStack!==null){const labels=['clearUpgrade','interruptUpgrade','upgradeRoute','onNativeDispatch','onNativeDispatchCancelled','rebind','beginScan','commit','start','stop','pagehide','begin'];row.stack=String(rawStack).split('\\n').slice(1,4).map(frame=>labels.find(label=>new RegExp('\\\\b'+label+'\\\\b').test(frame))??'other');row.reason=row.stack[1]??'other';}
 __j1UpgradeTraceCount++;console.log('J1_UPGRADE_TRACE '+JSON.stringify(row));
}catch{}};
`;
export const J1_UPGRADE_ANCHORS=[
 ['const clearUpgrade=()=>{','const clearUpgrade=()=>{__j1UpgradeTrace("clear",{identity:!!upgradeIdentity,display:!!upgradeDisplay},new Error().stack);'],
 ["  if(doc.location.href!==s.url){rememberDepartingRoute(s);upgrade.navigate",'  __j1UpgradeTrace("rebind",{routeChanged:doc.location.href!==s.url});if(doc.location.href!==s.url){rememberDepartingRoute(s);upgrade.navigate'],
 ['const identity=s.adapter.captureCandidateIdentity?.(event.plan.control);if(!identity)return;','const identity=s.adapter.captureCandidateIdentity?.(event.plan.control);__j1UpgradeTrace("capture",{identity:!!identity});if(!identity)return;'],
 ['upgradeDisplay=s.candidates?.displayFor(event.command)??null;','upgradeDisplay=s.candidates?.displayFor(event.command)??null;__j1UpgradeTrace("dispatch",{identity:!!identity,display:!!upgradeDisplay});'],
 ['     const preview=resolution&&upgrade.preview(resolution);','     const preview=resolution&&upgrade.preview(resolution);__j1UpgradeTrace("scan",{identity:!!prior.identity,display:!!prior.display,projectAcknowledged:s.ackProjects.has(route.projectId),preview:!!preview});'],
 ['      const pendingValid=pendingHandle&&matches(prior.identity,pendingHandle);','      const pendingValid=pendingHandle&&matches(prior.identity,pendingHandle);__j1UpgradeTrace("pending",{pendingHandle:!!pendingHandle,pendingValid:!!pendingValid});'],
 ['      if(pendingValid&&!known&&preview){','      __j1UpgradeTrace("resolve-gate",{pendingValid:!!pendingValid,known:!!known,preview:!!preview});if(pendingValid&&!known&&preview){'],
 ['       result=upgrade.resolve(resolution);','       result=upgrade.resolve(resolution);__j1UpgradeTrace("resolve",{resolved:!!result});'],
];
export function instrumentJ1UpgradeSource(source){
 if(source.includes('__j1UpgradeTrace'))throw Error('j1-upgrade-trace-already-instrumented');
 let output=source;for(const [anchor,replacement]of J1_UPGRADE_ANCHORS){if(output.split(anchor).length!==2)throw Error('j1-upgrade-trace-anchor-mismatch');output=output.replace(anchor,replacement);}return J1_UPGRADE_RECORDER+output;
}
/** Independent diagnostic package; original manifest and package stay intact. */
export async function createJ1UpgradeTracePackage(source,destination){
 await cp(source,destination,{recursive:true,errorOnExist:true,force:false});
 const original=await readFile(join(source,path),'utf8'),instrumented=instrumentJ1UpgradeSource(original);
 await writeFile(join(destination,path),instrumented);
 const trace={kind:'DIAGNOSTIC_ONLY_J1_UPGRADE_TRACE',unpacked:destination,limit:128,changes:[{path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)}]};
 await verifyJ1UpgradeTracePackage(trace);return trace;
}
export async function verifyJ1UpgradeTracePackage(trace){
 const info=JSON.parse(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 if(info.status!=='OFFLINE_HOST_RECONSTRUCTION'||trace.changes.length!==1||trace.changes[0].path!==path||!Object.hasOwn(info.files,path))throw Error('j1-upgrade-trace-offline-package-required');
 for(const [file,expected]of Object.entries(info.files)){
  const change=trace.changes.find(row=>row.path===file);
  if(change&&change.originalSha256!==expected)throw Error('j1-upgrade-trace-original-hash-mismatch');
  if(hash(await readFile(join(trace.unpacked,file)))!==(change?.instrumentedSha256??expected))throw Error('j1-upgrade-trace-package-changed');
 }
 const manifest=JSON.parse(await readFile(join(trace.unpacked,'manifest.json'),'utf8'));
 if(manifest.background?.type!=='module'){
  const compiled=compileClassicWorker(trace.unpacked);
  if(await readFile(join(trace.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('j1-upgrade-trace-worker-build-mismatch');
 }
 return true;
}
