import {createCurrentBodyDiscovery} from './current-body-discovery.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Isolated, fixed-profile pre-scope control metadata. Never returns account,
 * credentials, message IDs or body text. Page code cannot invoke this bridge. */
export function createContextAssociationBridge({document,runtime,origin,profile,isOwnedMask=()=>false,onPending=()=>{},onReady=()=>{},now=Date.now}={}){
 const discovery=createCurrentBodyDiscovery({document,profile,isOwnedMask,urlPolicy:createURLPolicy({origin})});let active=true;
 const listener=(m,sender,reply)=>{
  if(!active||sender?.id!==runtime.id||sender.tab)return;
  if(exactHostRecord(m,['type'])&&m.type==='HOST_CONTEXT_PENDING'){onPending();return;}
  if(exactHostRecord(m,['type'])&&m.type==='HOST_CONTEXT_READY'){onReady();return;}
  if(!exactHostRecord(m,['type','challenge','actualURL','conversationId','expiresAt'])||m.type!=='HOST_CONTEXT_ASSOCIATE'||!tokenOK(m.challenge)||!tokenOK(m.conversationId)||m.actualURL!==document.location.href||typeof m.expiresAt!=='string')return;
  const until=Date.parse(m.expiresAt),at=now();if(!Number.isFinite(until)||until<=at||until-at>6000)return;
  const claim=discovery.scan();
  if(now()>=until||document.location.href!==m.actualURL||claim.association!=='explicit-body-id'||claim.conversationId!==m.conversationId){reply(null);return;}
  reply({challenge:m.challenge,actualURL:m.actualURL,conversationId:claim.conversationId,association:claim.association});
 };
 runtime.onMessage.addListener(listener);
 function stop(){active=false;runtime.onMessage.removeListener(listener);discovery.stop();}
 return Object.freeze({stop});
}
