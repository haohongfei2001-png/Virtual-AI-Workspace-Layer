import {cleanupIsolatedBrowser} from './isolated-browser-cleanup.mjs';
import {historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
/** Independent Chromium in an isolated profile. Playwright must never enable
 * focus emulation: another CDP session cannot release its capturer handle.
 * https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts
 * https://chromium.googlesource.com/chromium/src/+/main/content/browser/devtools/protocol/emulation_handler.cc
 */
export function nativeBrowserArgs(profileDir,{headed=true,historicalNetworkGuard=null}={}){
 return ['--user-data-dir='+profileDir,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--metrics-recording-only','--no-sandbox','--enable-unsafe-extension-debugging','--window-size=1440,1000',...headed?[]:['--headless=new'],...(historicalNetworkGuard===null?[]:historicalNetworkGuardArgs(historicalNetworkGuard)),'about:blank'];
}
export function endpointFromActivePort(text){
 const [port,path]=text.trim().split('\n');
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535||!/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(path))throw Error('invalid-isolated-debug-endpoint');
 return `ws://127.0.0.1:${port}${path}`;
}
export async function launchNativeVisibilityBrowser({chromium,executablePath,profileDir,headed=true,historicalNetworkGuard=null}){
 await mkdir(profileDir);
 const args=nativeBrowserArgs(profileDir,{headed,historicalNetworkGuard}),child=spawn(executablePath,args,{stdio:['ignore','ignore','pipe']});let launchError,stderr='',browser;
 child.on('error',e=>{launchError=e;});child.stderr.on('data',v=>{stderr=(stderr+v.toString()).slice(-4000);});
 const cleanup=()=>cleanupIsolatedBrowser({browser,child,profileDir});
 try{
  const until=Date.now()+15000;let endpoint;
  while(Date.now()<until){if(launchError)throw launchError;if(child.exitCode!==null)throw Error('isolated-chrome-exited:'+child.exitCode+':'+stderr);try{endpoint=endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,50));}
  if(!endpoint)throw Error('isolated-chrome-debug-startup-timeout:'+stderr);
  browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});const context=browser.contexts()[0];if(!context)throw Error('missing-isolated-default-context');
  return {browser,context,close:cleanup,diagnostic:{transport:'isolated-loopback-CDP',noDefaults:true,headed,focusEmulation:'NOT_ENABLED_BY_PLAYWRIGHT',...(historicalNetworkGuard?{networkGuard:{mode:'DISPOSABLE_CHROME_REJECT_PROXY',...historicalNetworkGuard}}:{}),source:'Playwright connectOverCDP noDefaults public option; native Chromium capturer is session-owned'}};
 }catch(e){try{await cleanup();}catch(cleanupError){throw new AggregateError([e,cleanupError],'isolated-browser-startup-and-cleanup-failed');}throw e;}
}
