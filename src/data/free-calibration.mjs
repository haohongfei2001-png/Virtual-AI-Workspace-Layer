const priority={send:0,scope:0,current:0,recent:1,expiry:2,weak:2,history:3};
/** Bounded read-only calibration. request must honor signal; stale responses never apply. */
export class FreeCalibration {
  constructor({request,apply,now=()=>Date.now(),requestTimeoutMs=6000,cycleBudgetMs=30000,maxRequests=12,maxRetries=2}) {
    if(typeof request!=='function'||typeof apply!=='function'||!Number.isInteger(maxRetries)||maxRetries<0||maxRetries>2||requestTimeoutMs<=0||requestTimeoutMs>6000||cycleBudgetMs<=0||cycleBudgetMs>30000||!Number.isSafeInteger(maxRequests)||maxRequests<1)throw Error('invalid-calibration-budget');
    Object.assign(this,{request,apply,now,requestTimeoutMs,cycleBudgetMs,maxRequests,maxRetries});this.queue=new Map();this.generation=0;this.scope=null;this.controller=null;this.running=null;this.inFlight=null;
  }
  setScope(scope){if(scope!==this.scope){this.cancel();this.scope=scope;}}
  cancel(){this.generation++;this.controller?.abort();this.queue.clear();this.inFlight=null;}
  enqueue(objectId,trigger='history') {
    if(!this.scope||typeof objectId!=='string'||!objectId||!Object.hasOwn(priority,trigger))return false;
    if(this.inFlight===objectId)return false;
    const old=this.queue.get(objectId);if(!old||priority[trigger]<priority[old.trigger])this.queue.set(objectId,{objectId,trigger});return true;
  }
  run(){if(this.running)return this.runningGeneration===this.generation?this.running:this.running.then(()=>this.run());this.runningGeneration=this.generation;this.running=this.cycle().finally(()=>{this.running=null;});return this.running;}
  async cycle(){
    const generation=this.generation,scope=this.scope,start=this.now(),outcomes=[];let requests=0;
    while(this.queue.size&&requests<this.maxRequests&&this.now()-start<this.cycleBudgetMs&&generation===this.generation){
      const item=[...this.queue.values()].sort((a,b)=>priority[a.trigger]-priority[b.trigger])[0];this.queue.delete(item.objectId);this.inFlight=item.objectId;
      let completed=false;
      for(let attempt=0;attempt<=this.maxRetries&&requests<this.maxRequests&&generation===this.generation;attempt++){
        const remaining=this.cycleBudgetMs-(this.now()-start);if(remaining<=0)break;
        const controller=new AbortController();this.controller=controller;requests++;let timer;
        const boundary=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('calibration-cancelled')),{once:true});timer=setTimeout(()=>{controller.abort();},Math.min(this.requestTimeoutMs,remaining));});
        try{
          const value=await Promise.race([Promise.resolve().then(()=>this.request({...item,scope,attempt,signal:controller.signal})),boundary]);
          if(generation!==this.generation||scope!==this.scope||controller.signal.aborted)break;
          await Promise.race([Promise.resolve().then(()=>this.apply(value,{scope,objectId:item.objectId,generation,signal:controller.signal,isCurrent:()=>generation===this.generation&&scope===this.scope&&!controller.signal.aborted})),boundary]);
          if(generation!==this.generation||controller.signal.aborted)break;
          completed=true;outcomes.push({...item,status:'updated',attempts:attempt+1});break;
        }catch(error){if(generation!==this.generation)break;if(attempt===this.maxRetries)outcomes.push({...item,status:'degraded',reason:error.message,attempts:attempt+1,nextTrigger:'foreground-or-source-revision'});}
        finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
      }
      this.inFlight=null;
      if(!completed&&!outcomes.some(o=>o.objectId===item.objectId))outcomes.push({...item,status:generation===this.generation?'degraded':'cancelled',nextTrigger:'foreground-or-source-revision'});
    }
    // Budget exhaustion ends waiting; deferred work survives for the next explicit trigger.
    return {scope,status:generation===this.generation?(this.queue.size?'budget-exhausted':'complete'):'cancelled',requests,outcomes,pending:this.queue.size};
  }
}
