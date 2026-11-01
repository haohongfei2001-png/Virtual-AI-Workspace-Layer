import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {digest} from '../../src/data/hash.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';

// Independent fixture parent-chain oracle. Arrays/strings use canonical JSON;
// no production metadata parser or lineage implementation participates.
export function j4FixtureLineage(rows,conversationId,messageId){
 assert(Array.isArray(rows)&&rows.length>0&&rows.length<=256);assert(typeof conversationId==='string'&&conversationId);
 const byId=new Map();for(const row of rows){assert(typeof row.id==='string'&&row.id&&!byId.has(row.id));assert(row.parent===null||typeof row.parent==='string'&&row.parent);byId.set(row.id,row);}
 const chain=[],seen=new Set();let id=messageId;
 while(id!==null){assert(!seen.has(id)&&chain.length<32,'J4-fixture-lineage-cycle-or-depth');const row=byId.get(id);assert(row,'J4-fixture-lineage-parent-missing');seen.add(id);chain.unshift(id);id=row.parent;}
 return 'lineage_'+createHash('sha256').update(JSON.stringify([conversationId,chain])).digest('hex');
}

/** The fixture has independently specified original-send semantics. This does
 * not certify the no-original-time profile or reconstruct a lost local intent. */
export function assertJ4BeforeNativeRecovery({state,raw,facts,sent,scope,conversationId,title,expectedLineage,nativeAccepts,expectedAccepts,priorEvent=null}){
 const scopeKey=JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
 assert.equal(facts.scopeKey,scopeKey);assert.equal(scope.accountId,'principal_'+digest(['chatgpt-principal-v1',sent.author]));
 assert(typeof sent.id==='string'&&sent.id&&typeof sent.at==='string'&&Number.isFinite(Date.parse(sent.at)),'J4-original-send-time-required');
 assert.equal(state.ref?.id,conversationId);assert.equal(state.ref.nativeTitle,title);assert.equal(state.ref.availability,'available');
 const nativeSource=state.nativeSources?.[state.ref.sourceId];assert(nativeSource);assert.equal(nativeSource.revoked,false);assert.equal(nativeSource.channel,'host-dom');
 assert.equal(state.evidence.scopeKey,scopeKey);const matches=Object.values(state.evidence.events).filter(e=>e.conversationId===conversationId&&e.messageId===sent.id);
 assert.equal(matches.length,1,'J4-one-original-send-event-required');const event=matches[0];
 for(const [key,value]of Object.entries({actorVerified:true,actorScopeKey:scopeKey,role:'user',kind:'new-send',sendState:'committed',sentAt:sent.at,precision:'millisecond',revoked:false}))assert.equal(event[key],value,'J4-original-send-'+key);
 assert(/^lineage_[a-f0-9]{64}$/.test(expectedLineage));assert.equal(event.branchId,expectedLineage,'J4-original-send-lineage');
 const source=state.evidence.sources[event.sourceId];assert(source);assert.equal(source.revoked,false);assert.equal(source.channel,'host-evidence');assert.equal(source.codecVersion,2);assert.equal(source.profileId,'offline-original-send-v1');assert.equal(event.generation,source.generation);
 assert.equal(Object.values(state.evidence.hints).filter(h=>h.messageId===sent.id).length,0,'J4-no-reconstructed-local-ACK');
 assert.equal(state.pending.length,0,'J4-aborted-operation-has-no-pending');
 assert(!state.receipts.some(r=>r.operationId===facts.operationId||r.continuation?.evidence?.batch?.hints?.some(h=>h.messageId===sent.id)),'J4-aborted-continuation-must-not-revive');
 const absent=new Set([JSON.stringify([scopeKey,facts.operationId]),JSON.stringify([freeEvidenceKey(scopeKey),facts.evidenceOperationId])]);
 assert(Array.isArray(raw?.rows?.native_operations));assert(!raw.rows.native_operations.some(r=>absent.has(r.key)),'J4-aborted-receipt-must-stay-absent');
 assert(Number.isSafeInteger(expectedAccepts)&&expectedAccepts>0);assert.equal(nativeAccepts,expectedAccepts,'J4-no-native-send-replay');
 if(priorEvent!==null)assert.deepEqual(event,priorEvent,'J4-original-event-changed-on-reopen');
 return structuredClone(event);
}
