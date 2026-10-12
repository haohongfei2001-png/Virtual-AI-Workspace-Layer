/** Reproducible offline fixture package. This is never a production ChatGPT build. */
import {build} from './build.mjs';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,statSync} from 'node:fs';
import {resolve,relative,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const sorted=values=>[...values].sort((a,b)=>a<b?-1:a>b?1:0);
const slash=path=>path.split(sep).join('/');
function contained(root,path){const result=resolve(root,path);if(result===root||!result.startsWith(root+sep))throw Error('outside-package-root');return result;}
function files(root){const result=[];function visit(directory){for(const name of sorted(readdirSync(directory))){const path=join(directory,name);if(statSync(path).isDirectory())visit(path);else result.push(slash(relative(root,path)));}}visit(root);return sorted(result);}
function dependencies(source){
 return [...source.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
}
function closure(root,entries,{allowBuiltins=false}={}){
 const visited=new Set();function visit(name){const path=contained(root,name),key=slash(relative(root,path));if(visited.has(key))return;visited.add(key);
  if(!existsSync(path))throw Error('missing-static-import:'+key);
  for(const dependency of dependencies(readFileSync(path,'utf8'))){if(allowBuiltins&&dependency.startsWith('node:'))continue;if(!dependency.startsWith('.'))throw Error('nonlocal-static-import:'+dependency);visit(slash(relative(root,resolve(dirname(path),dependency))));}
 }for(const entry of entries)visit(entry);return sorted(visited);
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(data){let value=0xffffffff;for(const byte of data)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
/** ZIP32, stored bytes, UTF-8 paths, DOS 1980-01-01 00:00 and fixed regular-file mode. */
function zip(entries){
 const local=[],central=[];let offset=0;
 if(entries.length>65535)throw Error('zip32-entry-limit');
 for(const {name,data} of entries){const encoded=Buffer.from(name),checksum=crc32(data);if(encoded.length>65535||data.length>0xffffffff||offset>0xffffffff)throw Error('zip32-capacity');
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x21,12);header.writeUInt32LE(checksum,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(encoded.length,26);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(0x0314,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(0x21,14);directory.writeUInt32LE(checksum,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(encoded.length,28);directory.writeUInt32LE((0o100644<<16)>>>0,38);directory.writeUInt32LE(offset,42);
  local.push(header,encoded,data);central.push(directory,encoded);offset+=header.length+encoded.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}

export function verifyUnpacked(directory){
 const root=resolve(directory),manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
 if(manifest.manifest_version!==3||manifest.background?.type!=='module'||JSON.stringify(manifest.content_scripts?.flatMap(row=>row.matches))!==JSON.stringify(['http://127.0.0.1/hf/*'])||manifest.host_permissions?.length||JSON.stringify(manifest.permissions)!==JSON.stringify(['webNavigation']))throw Error('not-synthetic-only-package');
 const workerFiles=closure(root,[manifest.background.service_worker]);
 const expected=JSON.parse(readFileSync(join(root,'verification/build-manifest.json'),'utf8'));
 if(expected.status!=='SYNTHETIC_ONLY'||expected.releaseStatus!=='NOT_RELEASE_READY')throw Error('missing-package-boundary');
 for(const [name,hash]of Object.entries(expected.files)){const path=contained(root,name);if(!existsSync(path)||sha256(readFileSync(path))!==hash)throw Error('package-file-hash-mismatch:'+name);}
 const actual=files(root).filter(name=>name!=='verification/build-manifest.json');if(JSON.stringify(actual)!==JSON.stringify(sorted(Object.keys(expected.files))))throw Error('unexpected-package-files');
 return {status:'SYNTHETIC_ONLY',releaseStatus:'NOT_RELEASE_READY',files:actual.length+1,workerModules:workerFiles.length};
}

export function packageSynthetic(output){
 const out=resolve(output);if(existsSync(out))throw Error('output-must-be-new');
 const unpacked=join(out,'extension');mkdirSync(out,{recursive:true});const built=build(unpacked);
 const sourceFiles=closure(repositoryRoot,[...Object.keys(built).filter(name=>name.endsWith('.mjs')),'simulator/content-entry.mjs','simulator/build.mjs','simulator/package.mjs'],{allowBuiltins:true});
 const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,sha256(readFileSync(contained(repositoryRoot,name)))]));
 mkdirSync(join(unpacked,'verification'));
 const boundary={schema:'vaiwl-synthetic-offline-package-v1',status:'SYNTHETIC_ONLY',releaseStatus:'NOT_RELEASE_READY',realChatGPT:'UNSUPPORTED',productionHostAccess:false,requiresLocalSyntheticHost:true,completeRepositoryIncluded:false,extensionVersion:JSON.parse(readFileSync(join(unpacked,'manifest.json'),'utf8')).version,archiveFormat:'ZIP32_STORED',zipTimestamp:'1980-01-01T00:00:00',sourceManifestSha256:sha256(json({schema:'vaiwl-source-sha256-v1',files:sourceHashes}))};
 writeFileSync(join(unpacked,'verification/source-manifest.json'),json({schema:'vaiwl-source-sha256-v1',files:sourceHashes}));
 writeFileSync(join(unpacked,'verification/package-info.json'),json(boundary));
 writeFileSync(join(unpacked,'README.txt'),'VAIWL — SYNTHETIC_ONLY / NOT_RELEASE_READY\n\nThis package runs only on the local synthetic host. It does not work on ChatGPT.\nLoad this directory as an unpacked extension in a separate Chrome test profile.\nFrom the matching repository run: node simulator/server.mjs\nOpen: http://127.0.0.1:48173/hf/A/c/T0?mode=mv3\nThe synthetic host source is not included in the ZIP; use the matching repository.\nNo private accounts, remote models, paid services or deployment are required.\nPreserve your manual backup and unpacked-directory path when testing an upgrade.\nRemoving an extension can delete its browser storage; do not use uninstall as rollback.\nSee docs/engineering/FREE_PACKAGE_SUPPORT.md in the repository for boundaries.\n');
 const fileHashes=Object.fromEntries(files(unpacked).map(name=>[name,sha256(readFileSync(contained(unpacked,name)))]));
 writeFileSync(join(unpacked,'verification/build-manifest.json'),json({schema:'vaiwl-build-sha256-v1',status:'SYNTHETIC_ONLY',releaseStatus:'NOT_RELEASE_READY',files:fileHashes}));
 const verified=verifyUnpacked(unpacked),archive=join(out,'vaiwl-free-synthetic-only.zip');
 writeFileSync(archive,zip(files(unpacked).map(name=>({name,data:readFileSync(contained(unpacked,name))}))));
 const archiveSha256=sha256(readFileSync(archive));writeFileSync(join(out,'SHA256SUMS'),archiveSha256+'  vaiwl-free-synthetic-only.zip\n');
 return {...verified,unpacked,archive,archiveSha256,sourceManifestSha256:boundary.sourceManifestSha256};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv[2]==='--verify'){if(!process.argv[3])throw Error('Pass an unpacked extension directory');console.log(json(verifyUnpacked(process.argv[3])));}else{if(!process.argv[2])throw Error('Pass a NEW output directory');console.log(json(packageSynthetic(process.argv[2])));}}
