// Optional offline diagnostic around the original single inspect. It cannot
// change the production clock, retry a proof, or certify the instrumented run.
import {writeFile} from 'node:fs/promises';
export async function observeReadingProofCPU(page,path){
 const cdp=await page.context().newCDPSession(page);
 const record={status:'DIAGNOSTIC_ONLY',sourceCommit:process.env.FREE_SOURCE_COMMIT??process.env.GITHUB_SHA??null,window:'MARKED_FIRST_INSPECT',instrumented:true,extraAwaitBeforeInspect:false,proofCalls:0};
 const events=[];let overflow=false,finished=false;
 cdp.on('Tracing.dataCollected',({value})=>{if(events.length+value.length>50000)overflow=true;else events.push(...value);});
 await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,renderer.scheduler',options:'record-until-full',transferMode:'ReportEvents'});
 await page.exposeFunction('__vaiwlReadingProofStop',async proof=>{
  if(finished)throw Error('reading-cpu-invalid-stop');finished=true;
  const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');await complete;
  record.proofCalls=1;record.proof=proof;
  const starts=events.filter(e=>e.name==='vaiwl:first-inspect:start'),ends=events.filter(e=>e.name==='vaiwl:first-inspect:end');
  if(overflow||starts.length!==1||ends.length!==1)throw Error('reading-trace-window-invalid');
  const start=starts[0],end=ends[0];if(start.pid!==end.pid||start.tid!==end.tid||end.ts<start.ts)throw Error('reading-trace-window-mismatch');
  record.markedWindow={start,end,wallMicroseconds:end.ts-start.ts,threadMicroseconds:Number.isFinite(end.tts)&&Number.isFinite(start.tts)?end.tts-start.tts:null};
  record.threads=events.filter(e=>e.ph==='M'&&e.name==='thread_name').map(e=>({pid:e.pid,tid:e.tid,name:e.args?.name}));
  record.intervals=events.filter(e=>e.ph==='X'&&e.ts<=end.ts&&e.ts+(e.dur??0)>=start.ts).map(({name,cat,pid,tid,ts,dur,tts,tdur})=>({name,cat,pid,tid,ts,dur,tts,tdur}));
  record.traceEventCount=events.length;record.traceOverflow=overflow;
  await writeFile(path,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({readingPaintCPU:{...record,threads:undefined,intervals:undefined}}));
  await cdp.detach();
 });
}
