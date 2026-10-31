/** Read-only observation may follow an authorized iframe replacement. Actions may not. */
export async function observeCurrentFrame(getFrame,observe,{parentAlive,timeout=15000,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const until=now()+timeout;
 while(now()<until){
  if(!parentAlive())throw Error('native-parent-closed');
  const frame=getFrame();
  if(frame&&!frame.isDetached()){
   let ready=false;
   try{ready=await observe(frame);}catch(error){if(!frame.isDetached()||!parentAlive())throw error;}
   if(ready&&!frame.isDetached()&&getFrame()===frame)return frame;
  }
  await pause(50);
 }
 throw Error('current-authorized-frame-observation-timeout');
}
