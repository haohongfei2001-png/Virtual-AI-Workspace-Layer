import assert from 'node:assert/strict';
import {modernExpectedWorld} from './expected/modern.mjs';
// A separate conditional safety observation. It never changes the original
// cold acceptance case, deadline or scope authority, and never retries a GET.
export async function observeColdBoundary({waitMounted,snapshot}) {
 try { await waitMounted(); return {initialProjection:'PASS',missingReceiptSafety:'NOT_COVERED_THIS_RUN',immediateColdSupport:'NOT_ESTABLISHED_BY_THIS_RECOVERY_CASE'}; }
 catch(error) {
  if(error?.name!=='TimeoutError')throw error;
  const actual=await snapshot();
  assert.equal(actual.owned,0,'unconfirmed cold must not leave private surfaces');
  assert.equal(actual.nativeReading,true);assert.equal(actual.nativeComposer,true);
  return {initialProjection:'TIMEOUT',initialError:String(error.message),missingReceiptSafety:'NO_PRIVATE_SURFACE_NATIVE_PRESENT',receiptCause:'NOT_ESTABLISHED_WITHOUT_OWNER_TRACE',immediateColdSupport:'FAIL',actual};
 }
}

// Native history pagination is independent of the two current-conversation GETs.
export function coldConversationRequests(requests) {
 assert(Array.isArray(requests));
 return requests.filter(row=>/^\/backend-api\/conversation\/[0-9a-f-]+$/.test(row?.path??''));
}

export function coldProjectionTarget(boundary) {
 const id=boundary?.nativeNavigationRecovery==='PASS'?'44444444-4444-4444-8444-444444444444':'33333333-3333-4333-8333-333333333333';
 const expected=modernExpectedWorld.conversations.find(row=>row.id===id);assert(expected);
 return {path:'/c/'+id,title:expected.title};
}
