import {tokenOK} from '../b1/identity.mjs';
/** Profile-scoped DOM candidate only. No body text, author, receipt or ACK is read. */
export function createCurrentBodyDiscovery({document:doc,urlPolicy,profile,isOwnedMask=()=>false}={}){
 if(!doc?.defaultView||typeof urlPolicy?.parse!=='function'||!tokenOK(profile?.id)||!Number.isSafeInteger(profile.revision)||profile.revision<1||typeof isOwnedMask!=='function')throw Error('invalid-current-body-discovery');
 const config=profile.currentBody?{...profile.currentBody}:null;
 if(config&&(!['rootSelector','conversationIdAttribute','messageSelector','messageIdAttribute'].every(k=>typeof config[k]==='string'&&config[k].length>0&&config[k].length<=256)))throw Error('invalid-current-body-profile');
 const profileId=profile.id,profileVersion=profile.revision;let stopped=false,epoch=0,lastRoot=null,lastSignature=null;
 function visible(node){if(!node?.isConnected||node.ownerDocument!==doc||!node.getClientRects().length)return false;let depth=0;for(let p=node;p;p=p.parentElement){if(++depth>64)return false;const style=doc.defaultView.getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&isOwnedMask(p)!==true)return false;}return true;}
 function claim(root,signature,conversationId=null,messageIds=[]){if(root!==lastRoot||signature!==lastSignature){epoch++;lastRoot=root;lastSignature=signature;}return {conversationId,messageIds,association:conversationId===null?'unproven':'explicit-body-id',regionEpoch:epoch,evidence:{profileId,profileVersion,sourceKind:'native-dom',regionEpoch:epoch,fieldPaths:conversationId===null?['current-body-unproven']:['current-body-explicit-id','current-body-message-ids'],receiptId:null}};}
 function scan(){
  if(stopped)return claim(null,'stopped');if(!config)return claim(null,'unsupported-profile');
  let root=null;
  try{
   const roots=doc.querySelectorAll(config.rootSelector),route=urlPolicy.parse(doc.location.href);if(roots.length!==1)return claim(null,JSON.stringify(['ambiguous-root',roots.length,doc.location.href]));root=roots[0];
   const conversationId=root.getAttribute(config.conversationIdAttribute),shown=visible(root),base=[doc.location.href,conversationId,shown];
   if(!shown||!tokenOK(conversationId)||route?.kind!=='conversation'||route.conversationId!==conversationId)return claim(root,JSON.stringify(base));
   const nodes=root.querySelectorAll(config.messageSelector),ids=[],seen=new Set();
   // Inspect at most 256 selected DOM nodes. This is never a coverage claim.
   for(let i=0;i<Math.min(256,nodes.length);i++){const node=nodes[i];if(!root.contains(node)||!visible(node))continue;const id=node.getAttribute(config.messageIdAttribute);if(tokenOK(id)&&!seen.has(id)){seen.add(id);ids.push(id);}}
   return claim(root,JSON.stringify(base),conversationId,ids);
  }catch{return claim(root,'unavailable');}
 }
 // Presentation-owned concealment is not a native empty-message observation.
 // Do not cache or return old message IDs; consumers defer new proposals until
 // native visibility returns. The existing proof retains its original expiry.
 function isPresentationMasked(){if(stopped||!config)return false;try{const roots=doc.querySelectorAll(config.rootSelector);return roots.length===1&&isOwnedMask(roots[0])===true;}catch{return false;}}
 function affectsBody(records){
  if(stopped||!config||!Array.isArray(records)||!records.length)return false;
  try{const roots=[lastRoot,...doc.querySelectorAll(config.rootSelector)].filter(Boolean),contains=(a,b)=>a===b||a?.contains?.(b)===true;
   return records.some(r=>roots.some(root=>{
    if(r.type==='attributes'&&['data-va-mask-workspace','data-va-mask-sidebar'].includes(r.attributeName))return false;
    if(contains(root,r.target))return ['attributes','childList','characterData'].includes(r.type);
    if(r.type==='attributes'&&contains(r.target,root))return true;
    return r.type==='childList'&&[...(r.addedNodes??[]),...(r.removedNodes??[])].some(n=>contains(n,root));
   }));
  }catch{return true;}
 }
 function stop(){if(stopped)return;stopped=true;claim(null,'stopped');}
 return Object.freeze({scan,isPresentationMasked,affectsBody,stop});
}
