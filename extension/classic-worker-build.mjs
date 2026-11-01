import {createRequire} from 'node:module';
import {realpathSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(new URL('./tooling/package.json',import.meta.url));
const TOOL_VERSION='0.25.12';
/** One static BrowserLocal content script: its BOOT constant and complete
 * execution graph are captured together by Chrome, with no dynamic import. */
export function compileBrowserLocalContent(unpackedRoot){
 const esbuild=require('esbuild');if(esbuild.version!==TOOL_VERSION)throw Error('host-build-tool-version-mismatch');
 const root=realpathSync(unpackedRoot),identity=readFileSync(join(root,'extension/runtime-build.mjs'),'utf8');
 const build=/export const HOST_BUILD="([a-f0-9]{64})";/.exec(identity)?.[1];if(!build)throw Error('missing-host-content-build');
 const body=esbuild.buildSync({absWorkingDir:root,entryPoints:['extension/content-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:'chrome120',treeShaking:false,write:false,logLevel:'silent'}).outputFiles[0].text;
 const bootstrap=readFileSync(join(root,'extension/content-bootstrap.js'),'utf8');
 if(bootstrap.split("/* build-content-fingerprint */ 'source'").length!==2)throw Error('invalid-host-bootstrap-fingerprint-marker');
 const entry="import(runtime.getURL('extension/content-entry.mjs'))";
 if(bootstrap.split(entry).length!==2)throw Error('invalid-host-content-bootstrap-entry');
 return bootstrap.replace("/* build-content-fingerprint */ 'source'",JSON.stringify(build)).replace(entry,'(async()=>{\n"use strict";\n'+body+'\n})()');
}
/** Temporary DOM observation has no asynchronous module-registration gap. */
export function compileTemporaryContent(unpackedRoot){
 const esbuild=require('esbuild');
 if(esbuild.version!==TOOL_VERSION)throw Error('host-build-tool-version-mismatch');
 const root=realpathSync(unpackedRoot);
 return esbuild.buildSync({absWorkingDir:root,entryPoints:['extension/temporary-content-entry.mjs'],bundle:true,format:'iife',platform:'browser',target:'chrome120',treeShaking:true,write:false,logLevel:'silent'}).outputFiles[0].text;
}
/** Reproducible private worker bundles. Read the supplied package, including
 * its generated configuration and any explicitly instrumented test sources. */
export function compileClassicWorker(unpackedRoot){
 const esbuild=require('esbuild');
 if(esbuild.version!==TOOL_VERSION)throw Error('host-build-tool-version-mismatch');
 const root=realpathSync(unpackedRoot),bridge='__vaiwlHostBootstrap';
 const bundle=contents=>esbuild.buildSync({absWorkingDir:root,stdin:{contents,resolveDir:root,sourcefile:'host-worker-entry.mjs'},bundle:true,format:'iife',platform:'browser',target:'chrome120',treeShaking:false,write:false,logLevel:'silent'}).outputFiles[0].text;
 const gate=existsSync(join(root,'extension/runtime-build.mjs'))?bundle(`import {HOST_CONFIG} from './extension/config.mjs';import {runtimeBuildMatches} from './extension/runtime-build.mjs';if(HOST_CONFIG.browserLocal&&!runtimeBuildMatches(chrome.runtime))throw Error('runtime-build-mismatch');`):'';
 const bootstrap=gate+bundle(`import {HOST_BROWSER_BOOTSTRAP} from './extension/browser-bootstrap.mjs';globalThis.${bridge}=HOST_BROWSER_BOOTSTRAP;`);
 const runtime=gate+bundle(`import {createHostWorkerRuntime} from './src/runtime/host-worker-runtime.mjs';import {HOST_CONFIG} from './extension/config.mjs';if(HOST_CONFIG.temporaryReadOnly!==true){const bootstrap=globalThis.${bridge};if(!bootstrap)throw Error('missing-host-bootstrap');createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:bootstrap});}`);
 const entry=bootstrap+`\ntry{importScripts('classic-runtime.js');}catch(error){globalThis.${bridge}?.stop();throw error;}finally{delete globalThis.${bridge};}\n`;
 return {entry,runtime};
}
