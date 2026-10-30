// Optional offline diagnostic around the original single inspect. It cannot
// change the production clock, retry a proof, or certify the instrumented run.
import {writeFile} from 'node:fs/promises';
export async function observeReadingProofCPU(page,path){
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:250});
 await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
 const record={status:'DIAGNOSTIC_ONLY',sourceCommit:process.env.FREE_SOURCE_COMMIT??process.env.GITHUB_SHA??null,window:'FIRST_INSPECT_ENVELOPE',metricsClock:'THREAD_TICKS',profileClock:'SAMPLE_INTERVALS',instrumented:true,profileIncludes:['original inspect','start/stop bridge','metrics collection'],sampleUse:'hotspot and GC clues only; not net function CPU time',proofCalls:0};
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 let started=false,finished=false;
 await page.exposeFunction('__vaiwlReadingProofStart',async()=>{
  if(started)throw Error('reading-cpu-repeated-start');started=true;
  record.before=await metrics();await cdp.send('Profiler.start');
 });
 await page.exposeFunction('__vaiwlReadingProofStop',async proof=>{
  if(!started||finished)throw Error('reading-cpu-invalid-stop');finished=true;
  record.after=await metrics();record.profile=(await cdp.send('Profiler.stop')).profile;
  record.proofCalls=1;record.proof=proof;
  record.deltas=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','V8CompileDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,record.after[k]-record.before[k]]));
  const byId=new Map(record.profile.nodes.map(n=>[n.id,n])),samples=new Map();
  for(let i=0;i<record.profile.samples.length;i++){const frame=byId.get(record.profile.samples[i])?.callFrame,key=(frame?.functionName??'unknown')+':'+(frame?.lineNumber??-1);samples.set(key,(samples.get(key)??0)+record.profile.timeDeltas[i]);}
  record.topSampleIntervalMicroseconds=[...samples].sort((a,b)=>b[1]-a[1]).slice(0,25);
  await writeFile(path,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({readingPaintCPU:{...record,profile:undefined,before:undefined,after:undefined}}));
  await cdp.detach();
 });
}
