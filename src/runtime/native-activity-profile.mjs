import {exactHostRecord} from '../host/contract.mjs';
import {nativeMetadataIdOK} from '../host/metadata-candidates.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {digest} from '../data/hash.mjs';
/** Package-owned semantics. No production profile is enabled by this module. */
export function validateNativeActivityProfile(p){
 if(!exactHostRecord(p,['id','revision','providerProfile','semantics','timeUnit','orderDomain'])||!tokenOK(p.id)||!tokenOK(p.providerProfile)||!Number.isSafeInteger(p.revision)||p.revision<1||p.semantics!=='native-object-update'||!['second','millisecond','iso',null].includes(p.timeUnit)||p.orderDomain!==null&&!tokenOK(p.orderDomain)||p.timeUnit===null&&p.orderDomain===null)throw Error('invalid-native-activity-profile');
 return Object.freeze({...p});
}
/** Only normalized metadata fields from the private source, never a page claim.
 * Missing/null/invalid time stays undated. An ordered batch is comparable only
 * inside the one verified, unpinned/filter-specific domain in the profile. */
export function parseNativeActivityRows({items,observedAt,profile}){
 const p=validateNativeActivityProfile(profile),at=instant(observedAt);
 if(at===null||!Array.isArray(items)||items.length>256)throw Error('invalid-native-activity-observation');
 const ids=new Set(),times=[],gaps=[];
 for(const item of items){
  if(!exactHostRecord(item,Object.hasOwn(item??{},'updateTime')?['conversationId','updateTime']:['conversationId'])||!nativeMetadataIdOK(item.conversationId,'conversation')||ids.has(item.conversationId))throw Error('invalid-native-activity-row');
  ids.add(item.conversationId);
  if(p.timeUnit===null)continue;
  if(!Object.hasOwn(item,'updateTime')||item.updateTime===null){gaps.push({conversationId:item.conversationId,reason:Object.hasOwn(item,'updateTime')?'null-update-time':'missing-update-time'});continue;}
  const raw=item.updateTime,n=p.timeUnit==='iso'?instant(raw):typeof raw==='number'&&Number.isFinite(raw)?raw*(p.timeUnit==='second'?1000:1):null;
  if(n===null||!Number.isSafeInteger(n)||n<0||n>at){gaps.push({conversationId:item.conversationId,reason:'invalid-update-time'});continue;}
  const time=new Date(n).toISOString();times.push({conversationId:item.conversationId,candidateInterval:{from:time,through:time}});
 }
 const order=p.orderDomain===null?null:{domain:p.orderDomain,batch:'order_'+digest([p.id,p.revision,p.orderDomain,[...ids]]),ids:[...ids]};
 return {times,order,gaps};
}
