import {rm} from 'node:fs/promises';
import {cleanupOwnedResources} from '../isolated-browser-cleanup.mjs';
/** Only removes this runner's mkdtemp output, after confirmed browser closure. */
export async function cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted=false,networkGuard,server,directory,verify,remove=rm}){
 let browserClosed=!context&&!browserHandle&&!browserLaunchAttempted;
 if(!browserHandle&&!browserLaunchAttempted)context?.once?.('close',()=>{browserClosed=true;});
 return cleanupOwnedResources(report,[
  ['browser',async()=>{
   if(browserHandle){await browserHandle.close();browserClosed=true;return;}
   await context?.close();
   // A throwing launcher may have failed its own cleanup before returning a handle.
   // Neither an absent handle nor a context close proves that its child exited.
   if(browserLaunchAttempted)throw Error('browser-launch-close-unconfirmed');
   browserClosed=true;
  }],
  ...(networkGuard?[["network-guard",async()=>{await networkGuard.close();report.networkGuard=networkGuard.snapshot();}]]:[]),
  ['fixture-snapshot',()=>{report.fixture=server?.snapshot();}],
  ['fixture-server',()=>server?.close()],
  ['source-verification',verify],
  ['owned-temporary-directory',async()=>{
   if(!directory)return;
   if(!browserClosed){report.retainedTemporaryDirectory=directory;throw Error('browser-close-unconfirmed-profile-retained');}
   await remove(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.temporaryDirectoryRemoved=true;
  }],
 ]);
}
