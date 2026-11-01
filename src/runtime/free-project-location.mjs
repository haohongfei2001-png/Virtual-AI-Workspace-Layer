import {assertPreparedFreeSnapshot} from '../navigation/free-view.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Display location in the owner's prepared order, not identity/scope authority.
 * This performs no storage reads and leaves the frozen time session unchanged. */
export function locateFreeProject(current,query){
 const snapshot=assertPreparedFreeSnapshot(current?.snapshot);
 if(!exactHostRecord(query,['projectId','segment','limit'])||!tokenOK(query.projectId)||['__proto__','prototype','constructor'].includes(query.projectId)||!Number.isSafeInteger(query.segment)||query.segment<0||query.segment>1000000||!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>24)throw Error('invalid-free-project-location');
 let index=0;
 for(const group of snapshot.groups){
  // Keep the same null/decision fallback as projectFreeFrame's included().
  const segment=(group.activityDecision??group.activity)?.segment??group.segment??null;
  if(segment!==query.segment&&!(segment===null&&query.segment===0))continue;
  if(group.id===query.projectId)return {offset:Math.floor(index/query.limit)*query.limit,limit:query.limit};
  index++;
 }
 return null;
}
