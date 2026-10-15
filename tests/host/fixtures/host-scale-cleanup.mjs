import {rm} from 'node:fs/promises';
import {cleanupOwnedResources} from '../isolated-browser-cleanup.mjs';
/** Only removes this runner's mkdtemp output, after confirmed browser closure. */
export async function cleanupHostScaleRun({report,context,server,directory,verify,remove=rm}){
 let browserClosed=!context;
 context?.once?.('close',()=>{browserClosed=true;});
 return cleanupOwnedResources(report,[
  ['browser',async()=>{await context?.close();browserClosed=true;}],
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
