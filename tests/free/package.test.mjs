import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';
import vm from 'node:vm';
import {packageSynthetic,verifyUnpacked} from '../../simulator/package.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function archiveEntries(bytes){
 const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);const count=bytes.readUInt16LE(end+10),directory=bytes.readUInt32LE(end+16);assert.equal(directory+bytes.readUInt32LE(end+12),end);
 let offset=0;const entries=new Map();while(offset<directory){assert.equal(bytes.readUInt32LE(offset),0x04034b50);assert.equal(bytes.readUInt16LE(offset+8),0,'stored ZIP');assert.equal(bytes.readUInt16LE(offset+10),0,'fixed time');assert.equal(bytes.readUInt16LE(offset+12),0x21,'fixed date');const length=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extra,data=bytes.subarray(start,start+length);assert.equal(crc32(data),bytes.readUInt32LE(offset+14));assert(!entries.has(name));assert(!name.startsWith('/')&&!name.split('/').includes('..'));entries.set(name,data);offset=start+length;}
 assert.equal(entries.size,count);return entries;
}

test('offline synthetic ZIP is byte-reproducible across output paths and filesystem timestamps',()=>{
 const root=mkdtempSync(join(tmpdir(),'vaiwl-package-test-'));try{
  const a=packageSynthetic(join(root,'one'));utimesSync(join(a.unpacked,'manifest.json'),new Date(0),new Date(0));
  const b=packageSynthetic(join(root,'two'));assert.deepEqual(readFileSync(a.archive),readFileSync(b.archive));assert.equal(a.archiveSha256,b.archiveSha256);assert.equal(a.archiveSha256,sha(readFileSync(a.archive)));assert.equal(readFileSync(join(root,'one/SHA256SUMS'),'utf8'),a.archiveSha256+'  vaiwl-free-synthetic-only.zip\n');
  assert.throws(()=>packageSynthetic(join(root,'one')),/output-must-be-new/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('ZIP extracts matching hashed bundle, source manifest and explicit unsupported-production boundary',()=>{
 const root=mkdtempSync(join(tmpdir(),'vaiwl-package-content-'));try{
  const result=packageSynthetic(join(root,'bundle')),entries=archiveEntries(readFileSync(result.archive));
  assert(entries.has('manifest.json'));assert(entries.has('content.js'));assert(entries.has('simulator/worker.mjs'));
  const built=JSON.parse(entries.get('verification/build-manifest.json'));for(const [name,hash]of Object.entries(built.files))assert.equal(sha(entries.get(name)),hash,name);
  const source=JSON.parse(entries.get('verification/source-manifest.json'));assert(Object.keys(source.files).includes('src/data/free-replica.mjs'));for(const [name,hash]of Object.entries(source.files))assert.equal(sha(readFileSync(resolve(import.meta.dirname,'../..',name))),hash,name);
  const info=JSON.parse(entries.get('verification/package-info.json'));assert.equal(info.status,'SYNTHETIC_ONLY');assert.equal(info.releaseStatus,'NOT_RELEASE_READY');assert.equal(info.realChatGPT,'UNSUPPORTED');assert.equal(info.sourceManifestSha256,sha(entries.get('verification/source-manifest.json')));
  const manifest=JSON.parse(entries.get('manifest.json'));assert.deepEqual(manifest.content_scripts[0].matches,['http://127.0.0.1/hf/*']);assert.equal(manifest.host_permissions,undefined);new vm.Script(entries.get('content.js').toString());
  assert(verifyUnpacked(result.unpacked).workerModules>10);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('offline verifier rejects missing transitive worker module and changed bundled bytes',()=>{
 const root=mkdtempSync(join(tmpdir(),'vaiwl-package-tamper-'));try{
  const result=packageSynthetic(join(root,'bundle')),module=join(result.unpacked,'src/data/free-evidence-partitions.mjs'),saved=readFileSync(module);
  unlinkSync(module);assert.throws(()=>verifyUnpacked(result.unpacked),/missing-static-import/);writeFileSync(module,saved);
  const content=join(result.unpacked,'content.js');writeFileSync(content,readFileSync(content,'utf8')+'\n// tampered\n');assert.throws(()=>verifyUnpacked(result.unpacked),/package-file-hash-mismatch:content.js/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
