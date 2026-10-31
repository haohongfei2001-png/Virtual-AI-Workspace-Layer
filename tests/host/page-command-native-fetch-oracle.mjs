/** Narrow no-tap/host-command oracle. Never certifies a passive response tap. */
import assert from 'node:assert/strict';
export const commandKinds=Object.freeze(['fetch','headers','selector','javascript','raw-repository-batch']);
export const transportKinds=Object.freeze(['json','sse','ndjson','malformed-json','network-error','host-cancel']);
export function assertPageCommandNativeFetch(r){
 assert.equal(r.finalPrivacyScanPerformed,true);assert.equal(r.packagedMV3,true);assert.equal(r.packageVerified,true);assert.equal(r.workerNetworkBlocked,true);
 assert.equal(r.positivePrivateView,true);assert.equal(r.privateDatabasePresent,true);assert.equal(r.observationWindowComplete,true);
 assert.equal(r.fetchIdentityPreserved,true);assert.equal(r.pageHasRuntimeAccess,false);
 assert.deepEqual(r.commands.map(x=>x.kind).sort(),[...commandKinds].sort());
 for(const c of r.commands){assert.equal(c.delivered,true);assert.equal(c.requests,0);assert.equal(c.replies,0);}
 for(const key of ['privateLeaks','mutationMarkers','nativeWrites','unexpectedRequests','captureOverflow','captureUnsupported','pageMessageSchemaViolations'])assert.equal(r[key],0,key);
 assert.equal(r.privateDatabaseUnchanged,true);assert.equal(r.positiveLeakScanner,true);
 assert.deepEqual(r.transports.map(x=>x.kind).sort(),[...transportKinds].sort());
 for(const t of r.transports){assert.equal(t.fetchIdentityPreserved,true);assert.equal(t.samePromise,true);assert.equal(t.sameResult,true);assert.equal(t.expectedOutcome,true);}
 assert.equal(r.deliveryModel,'FINITE_ROUTE_FULFILL_NOT_CHUNKED_STREAM');
 assert.equal(r.fullSEC08,'NOT_ESTABLISHED');assert.equal(r.fullACT20,'NOT_ESTABLISHED');assert.equal(r.nativeTap,'NOT_IMPLEMENTED');
 assert.equal(r.cleanupOK,true);assert.equal(r.sourceChanged,false);
 return 'PASS_NARROW_PACKAGED_PAGE_COMMAND_AND_NO_TAP_CONTINUITY';
}

/** Serializable capture with one exact delivery exemption; extra fields/replays remain evidence. */
export function createCommandCapture(copy){
 const state={messages:[],delivered:[],pending:{},captureOverflow:0,captureUnsupported:0,bytes:0};
 function capture(data,origin,isSelf){
  let value,text;try{value=copy(data);text=JSON.stringify(value);}catch{state.captureUnsupported++;return;}
  const kind=value?.kind,expected=state.pending[kind];
  if(isSelf&&typeof expected==='string'&&text===expected){delete state.pending[kind];state.delivered.push(kind);return;}
  const bytes=new TextEncoder().encode(text).length;
  if(state.messages.length>=128||bytes>65536||state.bytes+bytes>262144){state.captureOverflow++;return;}
  state.bytes+=bytes;state.messages.push({origin,data:value});
 }
 return {state,capture};
}
