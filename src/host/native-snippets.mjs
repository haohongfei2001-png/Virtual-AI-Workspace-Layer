import {digest} from '../data/hash.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Explicit user-selected anchors only. Proof callbacks are private dependencies,
 * never page-supplied authority. No listener, automatic collection or persistence. */
export function createNativeSnippets({document:doc,urlPolicy,profile,current,proof,guard=()=>false,isOwnedMask=()=>false}={}){
 const raw=profile?.snippets,config=raw?.enabled===true?{...raw}:null;
 let stopped=false;
 const configured=!!config&&['rootSelector','conversationIdAttribute','messageSelector','messageIdAttribute','bodySelector','branchIdAttribute'].every(k=>typeof config[k]==='string'&&config[k].length>0&&config[k].length<=256);
 const live=()=>!stopped&&configured&&guard()===true;
 function visible(node){if(!node?.isConnected||node.ownerDocument!==doc||!node.getClientRects().length)return false;let depth=0;for(let p=node;p;p=p.parentElement){if(++depth>64)return false;const style=doc.defaultView.getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&isOwnedMask(p)!==true)return false;}return true;}
 function context(ref){
  if(!live()||typeof current!=='function'||typeof proof!=='function'||!tokenOK(ref?.id))return null;
  const state=current(),route=urlPolicy.parse(doc.location.href),target=urlPolicy.parse(ref.nativeUrl);
  if(!state||!Number.isSafeInteger(state.regionEpoch)||state.regionEpoch<0||route.kind!=='conversation'||target.kind!=='conversation'||route.conversationId!==ref.id||target.conversationId!==ref.id||state.conversationId!==ref.id)return null;
  const roots=doc.querySelectorAll(config.rootSelector);if(roots.length!==1)return null;const root=roots[0];if(!visible(root)||root.getAttribute(config.conversationIdAttribute)!==ref.id)return null;
  const messages=root.querySelectorAll(config.messageSelector);if(messages.length>256)return null;
  return {state:{...state},root,messages};
 }
 function messageFor(c,messageId){const matches=[...c.messages].filter(n=>n.getAttribute(config.messageIdAttribute)===messageId);if(matches.length!==1||!visible(matches[0]))return null;const message=matches[0],bodies=message.querySelectorAll(config.bodySelector);if(bodies.length!==1||!visible(bodies[0]))return null;return {message,body:bodies[0]};}
 function branchFor(c,message,messageId){
  const p=proof({refId:c.state.conversationId,messageId,regionEpoch:c.state.regionEpoch});
  if(!p||!tokenOK(p.bodyProofId)||p.conversationId!==c.state.conversationId||p.regionEpoch!==c.state.regionEpoch||!Array.isArray(p.messageIds)||p.messageIds.length>256||!p.messageIds.includes(messageId)||c.bodyProofId&&c.bodyProofId!==p.bodyProofId)return null;
  c.bodyProofId=p.bodyProofId;
  const branchId=message.getAttribute(config.branchIdAttribute);return tokenOK(branchId)?branchId:null;
 }
 // Hash the chosen message only, with finite traversal and allocation. Exclude
 // editable/input subtrees entirely; neither drafts nor files are snippet bodies.
 function safeStructure(body){
  const forbidden=n=>n.isContentEditable||['INPUT','TEXTAREA','SELECT','SCRIPT','STYLE'].includes(n.tagName);
  let depth=0;for(let n=body;n;n=n.parentElement){if(++depth>64||forbidden(n))return false;}
  let visited=0;const pending=[body];while(pending.length){const n=pending.pop();if(++visited>10000||n.ownerDocument!==doc||!n.isConnected)return false;if(n.nodeType!==1)continue;if(forbidden(n))return false;const children=n.childNodes;if(children.length+pending.length>10000)return false;for(let i=children.length-1;i>=0;i--)pending.push(children[i]);}return true;
 }
 function bodyText(body){let text='',visited=0;const stack=[body];while(stack.length){const n=stack.pop();if(++visited>10000||n.ownerDocument!==doc||!n.isConnected)throw Error('unavailable');if(n.nodeType===3){const piece=n.nodeValue??'';if(piece.length>65536-text.length)throw Error('unavailable');text+=piece;continue;}if(n.nodeType!==1)continue;if(n.isContentEditable||['INPUT','TEXTAREA','SELECT','SCRIPT','STYLE'].includes(n.tagName))throw Error('unavailable');const children=n.childNodes;if(children.length+stack.length>10000)throw Error('unavailable');for(let i=children.length-1;i>=0;i--)stack.push(children[i]);}return text;}
 function unchanged(c,ref,pair,messageId){const next=context(ref),currentPair=next&&messageFor(next,messageId);return !!currentPair&&next.root===c.root&&next.state.conversationId===c.state.conversationId&&next.state.regionEpoch===c.state.regionEpoch&&currentPair.message===pair.message&&currentPair.body===pair.body&&safeStructure(pair.body);}
 function selectedSnippet(ref){try{
  const c=context(ref);if(!c)return null;const selection=doc.getSelection();if(!selection||selection.rangeCount!==1||selection.isCollapsed)return null;const range=selection.getRangeAt(0);
  const candidates=[...c.messages].filter(m=>m.contains(range.startContainer)&&m.contains(range.endContainer));if(candidates.length!==1)return null;
  const messageId=candidates[0].getAttribute(config.messageIdAttribute);if(!tokenOK(messageId))return null;const pair=messageFor(c,messageId);if(!pair||!pair.body.contains(range.startContainer)||!pair.body.contains(range.endContainer))return null;
  const branchId=branchFor(c,pair.message,messageId);if(!branchId||!safeStructure(pair.body))return null;const body=bodyText(pair.body);const text=range.toString();if(!text.trim()||text.length>2000)return null;
  const offset=body.indexOf(text);if(offset<0||offset!==body.lastIndexOf(text)||branchFor(c,pair.message,messageId)!==branchId||!unchanged(c,ref,pair,messageId))return null;
  return {refId:ref.id,messageId,branchId,text,bodyHash:digest(body)};
 }catch{return null;}}
 function restoreSnippet(ref,anchor){try{
  if(!anchor||Object.keys(anchor).some(k=>!['id','refId','messageId','branchId','text','bodyHash'].includes(k))||anchor.refId!==ref?.id||!tokenOK(anchor.messageId)||!tokenOK(anchor.branchId)||typeof anchor.text!=='string'||!anchor.text.trim()||anchor.text.length>2000||typeof anchor.bodyHash!=='string'||!/^[a-f0-9]{64}$/.test(anchor.bodyHash))throw Error('unavailable');
  const c=context(ref),pair=c&&messageFor(c,anchor.messageId);if(!pair||branchFor(c,pair.message,anchor.messageId)!==anchor.branchId||!safeStructure(pair.body))throw Error('unavailable');
  const body=bodyText(pair.body),offset=body.indexOf(anchor.text);if(digest(body)!==anchor.bodyHash||offset<0||offset!==body.lastIndexOf(anchor.text)||branchFor(c,pair.message,anchor.messageId)!==anchor.branchId||!unchanged(c,ref,pair,anchor.messageId)||!live())throw Error('unavailable');
  pair.message.scrollIntoView({block:'center',behavior:'auto'});return {ok:true};
 }catch{return {ok:false,reason:'non-unique-or-changed-anchor'};}}
 return Object.freeze({selectedSnippet,restoreSnippet,stop(){stopped=true;}});
}
