// Test-only passive observer. Serialized into extension frames by Playwright.
// Never sends a request, changes a response, or grants production authority.
export function installJ4GrantObserver(){
 if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
 const send=chrome.runtime.sendMessage.bind(chrome.runtime);let sequence=0,grantSequence=0;
 chrome.runtime.sendMessage=function(...args){
  const request=args[0],requestedAt=Date.now(),requestSequence=++sequence,result=send(...args);
  if(result?.then)result.then(r=>{
   const receivedAt=Date.now();
   try{
    const text=v=>typeof v==='string'?v.slice(0,160):null;
    (globalThis.j4RpcTrace??=[]).push({at:receivedAt,requestedAt,type:text(request?.type),routeEpoch:Number.isSafeInteger(request?.routeEpoch)?request.routeEpoch:null,currentRef:typeof r?.page?.currentRef?.id==='string'&&/^[0-9a-f-]{36}$/i.test(r.page.currentRef.id)?r.page.currentRef.id:null,ok:typeof r?.ok==='boolean'?r.ok:null,state:text(r?.state),reason:text(r?.reason),hasGrant:!!r?.grant?.id,grantExpiresAt:typeof r?.grant?.expiresAt==='string'?Date.parse(r.grant.expiresAt):null,scope:text(r?.page?.scope)});
    if(globalThis.j4RpcTrace.length>16)globalThis.j4RpcTrace.shift();
   }catch{/* A diagnostic failure cannot affect the response. */}
   try{
    if(r?.ok&&r.grant?.id&&requestSequence>=grantSequence){
     const expiry=Date.parse(r.grant.expiresAt);
     if(!Number.isFinite(expiry)||expiry<=receivedAt)return;
     if(globalThis.j4Grant!==r.grant.id){globalThis.j4LastScope=null;globalThis.j4LastCurrentRef=null;globalThis.j4Freshness=null;}
     grantSequence=requestSequence;globalThis.j4Grant=r.grant.id;
     globalThis.j4Freshness={...(globalThis.j4Freshness??{}),grantId:r.grant.id,grantRequestedAt:requestedAt,grantReceivedAt:receivedAt,expiresAt:expiry};
    }
    if(request?.type==='HOST_UI_VIEW'&&r?.ok&&r.page?.scope&&request.grantId===globalThis.j4Grant&&globalThis.j4Freshness?.expiresAt>receivedAt&&requestSequence>=grantSequence){
     globalThis.j4LastScope=r.page.scope;globalThis.j4LastCurrentRef=r.page.currentRef?.id??null;
     globalThis.j4Freshness={...globalThis.j4Freshness,viewRequestedAt:requestedAt,viewReceivedAt:receivedAt,viewGrantId:request.grantId};
    }
   }catch{/* Do not mutate original replies or introduce unhandled rejection. */}
  },()=>{}).catch(()=>{});
  return result;
 };
}
