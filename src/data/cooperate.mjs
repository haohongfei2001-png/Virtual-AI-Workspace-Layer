/** Shared computation, sync for small contracts and yielding for large view replicas.
 * No timers, write authority or cached scope data belong to the calculation itself.
 */
export function finish(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
export async function finishAsync(iterator,guard=()=>true){let step;do{if(guard()!==true)throw Error('stale-client-response');step=iterator.next();if(!step.done){if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();else await new Promise(resolve=>setTimeout(resolve,0));}}while(!step.done);if(guard()!==true)throw Error('stale-client-response');return step.value;}
