/** Offline runner only: a timer wake is not evidence of wall-clock expiry. */
export async function observeLeaseExpiry(expiresAt,{wall=Date.now,elapsed=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxElapsedMs=20001,trace=[]}={}){
 const start=elapsed();let previousWall=wall(),previousElapsed=start;
 if(!Number.isFinite(expiresAt)||!Number.isFinite(start)||!Number.isFinite(previousWall)||maxElapsedMs!==20001||expiresAt+1-previousWall>maxElapsedMs)throw Error('invalid-lease-expiry-wait');
 for(let observation=0;observation<64;observation++){
  const now=wall(),tick=elapsed(),spent=tick-start;
  trace.push({wall:now,elapsedMs:spent,expiresAt});
  if(!Number.isFinite(now)||!Number.isFinite(tick)||now<previousWall||tick<previousElapsed)throw Error('lease-expiry-clock-invalid');
  if(spent>maxElapsedMs)throw Error('lease-expiry-observation-deadline');
  if(now>expiresAt)return trace;
  if(spent>=maxElapsedMs)throw Error('lease-expiry-observation-deadline');
  previousWall=now;previousElapsed=tick;
  await sleep(Math.min(Math.max(1,expiresAt+1-now),maxElapsedMs-spent));
 }
 throw Error('lease-expiry-observation-limit');
}
