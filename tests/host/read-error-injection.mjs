import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {verifyHost} from '../../extension/package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const path='src/runtime/host-view-service.mjs';
export const READ_ERROR_ANCHOR='return await entry.owner.refresh(...args);';
const recorder=`
// DIAGNOSTIC_ONLY: first three attempts per real view owner fail at the refresh boundary.
const __readErrorOwners=new WeakMap();let __readErrorOwnerSequence=0;globalThis.__vaiwlReadErrorTrace=[];
const __readErrorRefresh=(owner,args)=>{if(args.length)return owner.refresh(...args);let state=__readErrorOwners.get(owner);if(!state){state={id:++__readErrorOwnerSequence,attempt:0};__readErrorOwners.set(owner,state);}state.attempt++;const injected=state.attempt<=3;const row={kind:'DIAGNOSTIC_ONLY',owner:state.id,attempt:state.attempt,injected};if(globalThis.__vaiwlReadErrorTrace.length<128)globalThis.__vaiwlReadErrorTrace.push(row);console.log('READ_ERROR_ATTEMPT '+JSON.stringify(row));return injected?Promise.reject(Error('snapshot-revision-changed')):owner.refresh(...args);};
`;
export function instrumentReadErrorSource(source){
 if(typeof source!=='string'||source.includes('__readErrorRefresh')||source.split(READ_ERROR_ANCHOR).length!==2)throw Error('read-error-injection-anchor-mismatch');
 return recorder+source.replace(READ_ERROR_ANCHOR,'return await __readErrorRefresh(entry.owner,args);');
}
export async function createReadErrorPackage(source,destination){
 if(verifyHost(source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('read-error-offline-package-required');
 await cp(source,destination,{recursive:true,errorOnExist:true,force:false});
 const original=await readFile(join(source,path),'utf8'),modified=instrumentReadErrorSource(original);await writeFile(join(destination,path),modified);
 const changes=[{path,originalSha256:hash(original),instrumentedSha256:hash(modified)}],manifest=JSON.parse(await readFile(join(destination,'manifest.json'),'utf8'));
 if(manifest.background?.type!=='module'){
  const compiled=compileClassicWorker(destination);
  for(const [file,content]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const before=await readFile(join(source,file),'utf8');if(before!==content){await writeFile(join(destination,file),content);changes.push({path:file,originalSha256:hash(before),instrumentedSha256:hash(content)});}}
 }
 const receipt={kind:'DIAGNOSTIC_ONLY_READ_ERROR_INJECTION',unpacked:destination,failuresPerOwner:3,changes};await verifyReadErrorPackage(receipt);return receipt;
}
export async function verifyReadErrorPackage(receipt){
 const info=JSON.parse(await readFile(join(receipt.unpacked,'build-manifest.json'),'utf8'));
 if(receipt.kind!=='DIAGNOSTIC_ONLY_READ_ERROR_INJECTION'||receipt.failuresPerOwner!==3||info.status!=='OFFLINE_HOST_RECONSTRUCTION'||!receipt.changes.some(change=>change.path===path)||receipt.changes.some(change=>![path,'extension/worker.mjs','extension/classic-runtime.js'].includes(change.path))||new Set(receipt.changes.map(change=>change.path)).size!==receipt.changes.length)throw Error('read-error-invalid-package');
 for(const [file,expected]of Object.entries(info.files)){
  const change=receipt.changes.find(row=>row.path===file);if(change&&change.originalSha256!==expected)throw Error('read-error-original-hash-mismatch');
  if(hash(await readFile(join(receipt.unpacked,file)))!==(change?.instrumentedSha256??expected))throw Error('read-error-package-changed');
 }
 const manifest=JSON.parse(await readFile(join(receipt.unpacked,'manifest.json'),'utf8'));if(manifest.background?.type!=='module'){const compiled=compileClassicWorker(receipt.unpacked);if(await readFile(join(receipt.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(receipt.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('read-error-classic-worker-mismatch');}
 return true;
}
