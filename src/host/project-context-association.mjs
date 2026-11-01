import {createURLPolicy} from './url-policy.mjs';

/** A current native Project DOM association only; never a context or scope grant. */
export function createProjectContextAssociation({document:doc,profile,origin,isOwnedMask=()=>false}={}){
 if(!doc?.defaultView||!profile||typeof isOwnedMask!=='function')throw Error('invalid-project-context-association');
 const policy=createURLPolicy({origin,profile:profile.urlPolicy??{}});
 const selector=profile.regions?.members,attribute=profile.memberProjectIdAttribute;
 const configured=[selector,attribute].every(value=>typeof value==='string'&&value.length>0&&value.length<=256);
 function scan(){
  if(!configured)return null;
  try{
   const route=policy.parse(doc.location.href);
   if(route.kind!=='project')return null;
   const roots=doc.querySelectorAll(selector);
   if(roots.length!==1)return null;
   const root=roots[0];
   if(!root?.isConnected||root.ownerDocument!==doc||!root.getClientRects().length||root.getAttribute(attribute)!==route.projectId)return null;
   let depth=0;
   for(let node=root;node;node=node.parentElement){
    if(++depth>64||!node.isConnected||node.ownerDocument!==doc||node.hidden||node.getAttribute('aria-hidden')==='true')return null;
    const style=doc.defaultView.getComputedStyle(node);
    if(style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&isOwnedMask(node)!==true)return null;
   }
   return route.projectId;
  }catch{return null;}
 }
 return Object.freeze({scan});
}
