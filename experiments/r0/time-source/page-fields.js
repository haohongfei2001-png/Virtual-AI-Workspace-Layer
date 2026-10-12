({marker})=>{
 const official=location.protocol==='https:'&&location.hostname==='chatgpt.com';if(!official)return {official:false};
 const sensitive=/cookie|token|secret|authorization|session|account|email|credential|password/i;
 const time=/time|timestamp|created|sent[_-]?at|datetime/i;
 const messages=[...document.querySelectorAll('main [data-message-role],main [data-message-author-role]')];
 const dom=messages.map(n=>({role:n.getAttribute('data-message-role')??n.getAttribute('data-message-author-role'),ownSyntheticMarker:n.textContent.includes(marker),timeAttributeNames:[n,...n.querySelectorAll('*')].flatMap(x=>x.getAttributeNames().filter(k=>time.test(k))),timeElements:n.querySelectorAll('time').length}));
 const results={jsonScriptCount:0,jsonScriptParseErrors:0,jsonScriptBudgetExceeded:0,knownGlobalDescriptors:[],inlineInitializationScriptCount:0,inlineTimeKeyShapes:[],fields:[],ownMessageMetadata:[],nodeBudgetExceeded:false};
 let budget=10000;
 function visit(x,path,depth=0){
  if(--budget<0){results.nodeBudgetExceeded=true;return;}if(!x||typeof x!=='object'||depth>20)return;
  if(Array.isArray(x)){for(const v of x.slice(0,500))visit(v,path.concat('[]'),depth+1);return;}
  const role=x.author?.role??x.role;const own=role==='user'&&Array.isArray(x.content?.parts)&&x.content.parts.some(p=>typeof p==='string'&&p.includes(marker));
  if(own)results.ownMessageMetadata.push({path:path.join('.'),role:'user',idPresent:typeof x.id==='string',timeFieldNames:Object.keys(x).filter(k=>time.test(k))});
  for(const k of Object.keys(x)){
   if(sensitive.test(k))continue;const descriptor=Object.getOwnPropertyDescriptor(x,k);if(!descriptor||!('value'in descriptor))continue;const v=descriptor.value;
   if(time.test(k)){const row={field:path.concat(k).join('.'),type:v===null?'null':typeof v,associatedOwnUserMessage:own};if(typeof v==='number'){row.unixSecondsPlausible=v>1.5e9&&v<2.5e9;row.unixMillisecondsPlausible=v>1.5e12&&v<2.5e12;row.fractionalDigits=String(v).split('.')[1]?.length??0;}results.fields.push(row);}
   if(v&&typeof v==='object')visit(v,path.concat(k),depth+1);
  }
 }
 for(const s of document.querySelectorAll('script[type="application/json"]')){
  results.jsonScriptCount++;if(s.textContent.length>2*1024*1024){results.jsonScriptBudgetExceeded++;continue;}
  try{visit(JSON.parse(s.textContent),['json-script']);}catch{results.jsonScriptParseErrors++;}
 }
 for(const name of ['__NEXT_DATA__','__NUXT__','__INITIAL_STATE__','__next_f']){
  const d=Object.getOwnPropertyDescriptor(globalThis,name);if(!d)continue;results.knownGlobalDescriptors.push({name,type:'value'in d?typeof d.value:'accessor-not-read'});if('value'in d&&d.value&&typeof d.value==='object')visit(d.value,[name]);
 }
 // Page-exposed initialization scripts only, never fetching asset source or eval.
 // Lexical key shapes are NOT asserted to be populated or message-time evidence.
 for(const s of document.querySelectorAll('script:not([src]):not([type="application/json"])')){
  const t=s.textContent;if(t.length>2*1024*1024)continue;if(!/__NEXT_DATA__|__NUXT__|__INITIAL_STATE__|__next_f|octane/i.test(t))continue;results.inlineInitializationScriptCount++;
  for(const m of t.matchAll(/["']((?:create|created|sent|server|response|update)[_-]?(?:time|at)|timestamp|createdAt|createTime|sentAt)["']\s*:/gi))results.inlineTimeKeyShapes.push(m[1]);
 }
 results.inlineTimeKeyShapes=[...new Set(results.inlineTimeKeyShapes)].slice(0,100);results.fields=results.fields.slice(0,500);
 return {official:true,scope:'UNVERIFIED',derivedEnabled:false,dom,initialization:results,initializationOnlyInPageFiltered:true,rawScriptStateNotExported:true,noPrivateStateOrStorageInspection:true};
}
