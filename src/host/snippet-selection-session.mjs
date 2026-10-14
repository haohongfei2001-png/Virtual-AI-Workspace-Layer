import {tokenOK} from '../b1/identity.mjs';
const fields=['refId','messageId','branchId','text','bodyHash'];
const forbidden=new Set(['__proto__','constructor','prototype']);
const token=value=>tokenOK(value)&&!forbidden.has(value);
function anchor(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)return null;
 const copy={};for(const field of fields){const d=Object.getOwnPropertyDescriptor(value,field);if(!d||!Object.hasOwn(d,'value'))return null;copy[field]=d.value;}
 if(!['refId','messageId','branchId'].every(k=>token(copy[k]))||typeof copy.text!=='string'||!copy.text.trim()||copy.text.length>2000||typeof copy.bodyHash!=='string'||!/^[a-f0-9]{64}$/.test(copy.bodyHash))return null;
 return Object.freeze(copy);
}
/** One short-lived, content-owned selection. The injected binding fingerprint
 * must include document, producer, route epoch and verified scopeGrantId.
 * This helper cannot obtain that authority from DOM attributes or an iframe. */
export function createSnippetSelectionSession({adapter,currentBinding=()=>null,currentSelectionEpoch=()=>null,now=Date.now,makeId=()=>crypto.randomUUID()}={}){
 if(typeof adapter?.selectedSnippet!=='function'||typeof currentBinding!=='function'||typeof currentSelectionEpoch!=='function'||typeof now!=='function'||typeof makeId!=='function')throw Error('invalid-snippet-selection-session');
 let ticket=null,stopped=false;
 const clear=()=>{ticket=null;return null;};
 const binding=()=>{const value=currentBinding();return typeof value==='string'&&value.length>0?value:null;};
 const epoch=()=>{const value=currentSelectionEpoch();return typeof value==='string'&&value.length>0?value:null;};
 const clock=()=>{const n=now();return typeof n==='number'&&Number.isFinite(n)?n:null;};
 const refKey=ref=>ref&&token(ref.id)&&typeof ref.nativeUrl==='string'&&ref.nativeUrl.length>0?JSON.stringify([ref.id,ref.nativeUrl]):null;
 function live(id){
  if(stopped||!ticket||id!==ticket.id)return false;
  const at=clock();if(at===null||at<ticket.at||at-ticket.at>=6000||binding()!==ticket.binding||epoch()!==ticket.epoch){clear();return false;}return true;
 }
 return Object.freeze({
  capture(ref){
   clear();if(stopped)return null;
   try{const bound=binding(),selectedEpoch=epoch(),at=clock(),key=refKey(ref);if(!bound||!selectedEpoch||at===null||!key)return null;
    const selected=anchor(adapter.selectedSnippet(ref));if(!selected||selected.refId!==ref.id||binding()!==bound||epoch()!==selectedEpoch||refKey(ref)!==key)return null;
    const after=clock();if(after===null||after<at||after-at>=6000)return null;
    const id=makeId();if(!token(id)||binding()!==bound||epoch()!==selectedEpoch)return null;
    ticket={id,at,binding:bound,epoch:selectedEpoch,key,selected};return id;
   }catch{return clear();}
  },
  read(selectionId,ref){
   try{if(!live(selectionId))return null;const current=ticket;if(refKey(ref)!==current.key)return clear();
    const selected=anchor(adapter.selectedSnippet(ref));
    if(ticket!==current||!live(selectionId)||refKey(ref)!==current.key||!selected||fields.some(field=>selected[field]!==current.selected[field]))return clear();
    return selected;
   }catch{return clear();}
  },
  consume(selectionId){try{if(!live(selectionId))return false;clear();return true;}catch{clear();return false;}},
  stop(){stopped=true;clear();}
 });
}
