import {execFileSync} from 'node:child_process';import {mkdir,cp,rm,readFile,readdir} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
export const OLD_HOST_COMMIT='a8addaa9e014f22704a459d6ee126e8f80ead571';
export const OLD_PRO_COMMIT='176ebc9a3620f6e174e542e3320ff7008cd6ebe8';
export async function historicalSource(repoRoot,commit,target){
 if(![OLD_HOST_COMMIT,OLD_PRO_COMMIT].includes(commit))throw Error('unapproved-historical-fixture');
 const actual=execFileSync('git',['rev-parse',commit+'^{commit}'],{cwd:repoRoot,encoding:'utf8'}).trim();if(actual!==commit)throw Error('historical-commit-mismatch');
 await mkdir(target);const paths=commit===OLD_HOST_COMMIT?['src','simulator','extension']:['src','simulator'];
 const archive=execFileSync('git',['archive',commit,...paths],{cwd:repoRoot,maxBuffer:64*1024*1024});execFileSync('tar',['-xf','-','-C',target],{input:archive});return {commit,archiveHash:createHash('sha256').update(archive).digest('hex'),paths};
}
export async function directoryDigest(directory){const entries=[];async function walk(path,prefix=''){for(const e of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const key=prefix+e.name;if(e.isDirectory())await walk(join(path,e.name),key+'/');else if(e.isFile())entries.push([key,createHash('sha256').update(await readFile(join(path,e.name))).digest('hex')]);else throw Error('unexpected-package-entry');}}await walk(directory);return createHash('sha256').update(JSON.stringify(entries)).digest('hex');}
/** Caller must first confirm management-disabled. Same slot path preserves ID. */
export async function replaceDisabledPackage(source,slot,{disabled,root}){if(disabled!==true||!resolve(slot).startsWith(resolve(root)+'/'))throw Error('unsafe-package-replacement');await rm(slot,{recursive:true,force:true});await cp(source,slot,{recursive:true});const digest=await directoryDigest(source);if(await directoryDigest(slot)!==digest)throw Error('copied-package-mismatch');return digest;}
