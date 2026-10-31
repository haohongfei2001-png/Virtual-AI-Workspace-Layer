// Poll the same Playwright locator used for visibility and the eventual click.
// Locator resolution traverses the renderer's open shadow DOM and survives rerenders.
export async function waitForHistoryControl(locator,{now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const deadline=now()+30000;
 while(now()<deadline){
  if(await locator.isEnabled())return;
  await pause(Math.min(50,Math.max(0,deadline-now())));
 }
 throw new Error('J3 historical control remained disabled for 30000ms');
}
