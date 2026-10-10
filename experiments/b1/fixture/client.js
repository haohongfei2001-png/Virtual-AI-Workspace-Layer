/* Runs only on the disposable 127.0.0.1 synthetic fixture, never ChatGPT. */
(async()=>{
 if(window!==window.top||!/\/b1-fixture\/[AB]\.html$/.test(location.pathname))return;
 const clientId='client_'+crypto.randomUUID().replaceAll('-','_');
 let seq=0,leaseId=null;
 const node=document.createElement('section');
 node.dataset.b1Probe='synthetic-only';
 node.setAttribute('aria-label','B1 synthetic fixture');
 const label=document.createElement('output');label.dataset.b1Result='true';
 const button=(name,fn)=>{
   const b=document.createElement('button');b.textContent=name;
   b.dataset.b1Action=name;b.addEventListener('click',fn);node.append(b);
 };
 const send=async(type,extra={})=>{
   const request={v:1,type,clientId,seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra};
   try{const response=await chrome.runtime.sendMessage(request);
     label.textContent=JSON.stringify(response);label.dataset.ok=String(response?.ok===true);label.dataset.done=String(seq);
     if(type==='BIND')leaseId=response?.ok?response.leaseId:null;
     return response;
   }catch(e){label.textContent=JSON.stringify({ok:false,reason:'transport'});return null;}
 };
 button('BIND',()=>send('BIND'));
 button('PUT',()=>send('UPSERT_REF',{conversationId:'fixture_ref',operationId:'write_'+crypto.randomUUID().replaceAll('-','_'),expectedRevision:Number(node.dataset.revision||0)}).then(r=>{if(r?.ok)node.dataset.revision=r.record.revision;}));
 button('PUT_FIXED',()=>send('UPSERT_REF',{conversationId:'fixed_ref',operationId:'fixed_once',expectedRevision:0}));
 button('PUT_CONFLICT',()=>send('UPSERT_REF',{conversationId:'fixed_ref',operationId:'fixed_once',expectedRevision:1}));
 button('RACE',()=>send('UPSERT_REF',{conversationId:'race_ref',operationId:'race_'+crypto.randomUUID().replaceAll('-','_'),expectedRevision:0}));
 button('GET',()=>send('GET_REF',{conversationId:'fixture_ref'}));
 button('LIST',()=>send('LIST_REFS'));
 button('CHECK',()=>send('CHECK'));
 node.append(label);
 (document.querySelector('#fixture-slot')||document.body).append(node);
 chrome.runtime.onMessage.addListener(message=>{
   if(message?.type==='B1_REVOKE'){
     leaseId=null;label.textContent='{"ok":false,"reason":"route-revoked"}';
     label.dataset.ok='false';
   }
 });
 await send('BIND');
})();
