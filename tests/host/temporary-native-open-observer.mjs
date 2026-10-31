/** Test oracle: an action popup may disappear before its input RPC acknowledges. */
export const TEMPORARY_OPEN_DEADLINE_MS=6000;
export function observeTemporaryNativeOpen({press,release,onPage,onPopupClosed,readPage,readOriginal,clock={now:()=>performance.now(),setTimeout,clearTimeout}}){
 const started=clock.now(),deadline=started+TEMPORARY_OPEN_DEADLINE_MS;
 return new Promise((resolve,reject)=>{
  let done=false,released=false,closedAfterRelease=false,input=null,page=null,pageCount=0,pageValid=false,originalValid=false;
  const removers=[];let timer;
  const finish=(error)=>{if(done)return;if(!error&&(!input||!pageValid||!originalValid))return;done=true;clock.clearTimeout(timer);for(const remove of removers)remove();if(error)reject(error);else resolve({page,pageCount,inputAcknowledgement:input,elapsedMs:clock.now()-started});};
  const fail=message=>finish(Error(message));
  const current=()=>{if(done)return false;if(clock.now()>=deadline){fail('temporary-native-open-deadline');return false;}return true;};
  timer=clock.setTimeout(()=>fail('temporary-native-open-deadline'),TEMPORARY_OPEN_DEADLINE_MS);
  removers.push(onPopupClosed(()=>{if(!current())return;if(!released){fail('popup-closed-before-release');return;}closedAfterRelease=true;}));
  removers.push(onPage(candidate=>{
   if(!current())return;if(!released){fail('native-page-before-release');return;}if(++pageCount!==1){fail('duplicate-native-page');return;}page=candidate;
   Promise.resolve().then(()=>readPage(candidate,deadline-clock.now())).then(value=>{
    if(!current())return;if(value?.correctURL!==true||value?.openerNull!==true){fail('native-page-mismatch');return;}pageValid=true;
    return Promise.resolve(readOriginal()).then(value=>{if(!current())return;if(value!==true){fail('original-document-or-draft-changed');return;}originalValid=true;finish();});
   }).catch(finish);
  }));
  Promise.resolve().then(()=>{if(current())return press();}).then(()=>{
   if(!current())return;released=true;return Promise.resolve(release()).then(()=>{if(!current())return;input='ACK';finish();},error=>{
    if(!current())return;if(error?.code!=='CDP_TARGET_CLOSED'||!closedAfterRelease){finish(error);return;}input='UNAVAILABLE_TARGET_CLOSED';finish();
   });
  }).catch(finish);
 });
}
