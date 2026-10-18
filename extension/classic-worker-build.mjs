import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
const require=createRequire(new URL('./tooling/package.json',import.meta.url));
const TOOL_VERSION='0.25.12';
/** Reproducible private worker bundles. Read the supplied package, including
 * its generated configuration and any explicitly instrumented test sources. */
export function compileClassicWorker(unpackedRoot){
 const esbuild=require('esbuild');
 if(esbuild.version!==TOOL_VERSION)throw Error('host-build-tool-version-mismatch');
 const root=realpathSync(unpackedRoot),bridge='__vaiwlHostBootstrap';
 const bundle=contents=>esbuild.buildSync({absWorkingDir:root,stdin:{contents,resolveDir:root,sourcefile:'host-worker-entry.mjs'},bundle:true,format:'iife',platform:'browser',target:'chrome120',treeShaking:false,write:false,logLevel:'silent'}).outputFiles[0].text;
 const bootstrap=bundle(`import {HOST_BROWSER_BOOTSTRAP} from './extension/browser-bootstrap.mjs';globalThis.${bridge}=HOST_BROWSER_BOOTSTRAP;`);
 const runtime=bundle(`import {createHostWorkerRuntime} from './src/runtime/host-worker-runtime.mjs';import {HOST_CONFIG} from './extension/config.mjs';if(HOST_CONFIG.temporaryReadOnly!==true){const bootstrap=globalThis.${bridge};if(!bootstrap)throw Error('missing-host-bootstrap');createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:bootstrap});}`);
 const entry=bootstrap+`\ntry{importScripts('classic-runtime.js');}catch(error){globalThis.${bridge}?.stop();throw error;}finally{delete globalThis.${bridge};}\n`;
 return {entry,runtime};
}
