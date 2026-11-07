import {digest, stable} from '../../data/hash.mjs';
import {metadataEvidenceId} from '../evidence/metadata.mjs';
import {boundedText, boundedJSON, exact, integer} from './schema-runtime.mjs';

const randomToken = () => globalThis.crypto.randomUUID().replaceAll('-', '');
export function validateProviderPayload(input) {
  const payload = boundedJSON(input, {maxBytes: 32768});
  exact(payload, ['schema', 'requestNonce', 'items', 'candidateTopics', 'allowedOperations', 'outputSchemaVersion']);
  if (payload.schema !== 'vaiwl-pro-provider-input/1' || payload.outputSchemaVersion !== 'vaiwl-pro-model-output/1') throw Error('invalid-provider-schema');
  boundedText(payload.requestNonce, 96, 8);
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 10 ||
      !Array.isArray(payload.candidateTopics) || payload.candidateTopics.length > 20) throw Error('provider-item-bound');
  const handles = new Set();
  const handle = value => { if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(value) || handles.has(value)) throw Error('invalid-provider-handle'); handles.add(value); };
  for (const item of payload.items) {
    exact(item, ['handle', 'approvedTitle', 'approvedAliases', 'approvedText']); handle(item.handle); boundedText(item.approvedTitle, 400);
    if (!Array.isArray(item.approvedAliases) || item.approvedAliases.length > 100 || !Array.isArray(item.approvedText) || item.approvedText.length > 30) throw Error('provider-array-bound');
    item.approvedAliases.forEach(alias => boundedText(alias, 200));
    for (const evidence of item.approvedText) {
      exact(evidence, ['evidenceHandle', 'kind', 'text']); handle(evidence.evidenceHandle); boundedText(evidence.text, 6000);
      if (!['selected-text', 'sent-user-input'].includes(evidence.kind)) throw Error('unsupported-provider-evidence');
    }
  }
  for (const topic of payload.candidateTopics) {
    exact(topic, ['handle', 'approvedName', 'approvedIntentSummary']); handle(topic.handle); boundedText(topic.approvedName, 200);
    if (topic.approvedIntentSummary !== null) boundedText(topic.approvedIntentSummary, 500);
  }
  if (!Array.isArray(payload.allowedOperations) || !payload.allowedOperations.length || payload.allowedOperations.length > 7 ||
      new Set(payload.allowedOperations).size !== payload.allowedOperations.length ||
      payload.allowedOperations.some(op => !['classify', 'name', 'propose-topic', 'propose-series', 'propose-split', 'propose-merge', 'propose-topic-relation'].includes(op))) throw Error('invalid-allowed-operations');
  return payload;
}

/** Only this explicit projection becomes provider input. The EvidencePack,
 * handle map, native IDs/URLs, grant, scope, and revisions remain owner-private.
 * For metadata-only evidence the conversation handle cites its OWN approved
 * title/aliases. This fills the frozen payload's absent titleEvidenceHandle
 * without transmitting new fields or calling a title a selected-text snippet. */
export function buildProviderPayload(pack, overlay, {nonce = randomToken(), maxInputTokens = 32768} = {}) {
  boundedText(nonce, 96, 8); integer(maxInputTokens, 131072);
  if (pack.format !== 'vaiwl-pro-evidence/1' || pack.scope.key !== overlay.scopeKey) throw Error('invalid-evidence-pack');
  const handles = new Map(), metadataEvidence = new Map(), evidenceOwners = new Map();
  const create = (kind, id) => { const key = (kind === 'conversation' ? 'c_' : kind === 'topic' ? 't_' : 'e_') + randomToken(); handles.set(key, {kind, id}); return key; };
  const items = pack.metadata.map(metadata => {
    const handle = create('conversation', metadata.refId);
    metadataEvidence.set(handle, metadataEvidenceId(metadata));
    const approvedText = (pack.content ?? []).filter(item => item.refId === metadata.refId).map(item => {
      const evidenceHandle = create('evidence', item.evidenceId); evidenceOwners.set(evidenceHandle, metadata.refId);
      return {evidenceHandle, kind: item.kind === 'explicit-selected-text' ? 'selected-text' : 'sent-user-input', text: item.text};
    });
    return {handle, approvedTitle: metadata.nativeTitle, approvedAliases: [...metadata.humanAliases], approvedText};
  });
  const candidateTopics = pack.knownCandidateTopicIds.map(id => {
    const topic = overlay.topics[id];
    if (!topic || topic.scopeKey !== pack.scope.key || topic.lifecycle !== 'active') throw Error('stale-topic');
    return {handle: create('topic', id), approvedName: topic.name,
      approvedIntentSummary: topic.intent ? [topic.intent.object, topic.intent.objective].filter(Boolean).join(' · ').slice(0, 500) : null};
  });
  const payload = validateProviderPayload({schema: 'vaiwl-pro-provider-input/1', requestNonce: nonce, items, candidateTopics,
    allowedOperations: ['classify', 'name', 'propose-topic'], outputSchemaVersion: 'vaiwl-pro-model-output/1'});
  // UTF-8 byte count is a conservative input-token bound for this JSON text;
  // provider transport separately budgets its fixed instruction/schema overhead.
  if (new TextEncoder().encode(stable(payload)).byteLength > maxInputTokens) throw Error('input-token-bound');
  return {payload, handleMap: {requestNonce: nonce, scopeKey: pack.scope.key, inputDigest: pack.versions.evidenceDigest,
    handles, metadataEvidence, evidenceOwners, payloadDigest: digest(payload)}};
}
