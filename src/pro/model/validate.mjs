import {digest} from '../../data/hash.mjs';
import {MODEL_OUTPUT_SCHEMA} from './output-schema.mjs';
import {validateSchema} from './schema-runtime.mjs';
import {sameVersions} from '../evidence/metadata.mjs';
import {validateProviderPayload} from './payload.mjs';
import {lexicalOverlap} from '../organize/recall.mjs';

export function validateModelSchema(value) { return validateSchema(value, MODEL_OUTPUT_SCHEMA); }
const normalized = text => text.normalize('NFKC').toLocaleLowerCase('en-US');
function assertSupportedText(text, evidence, reason) {
  if (/https?:\/\/|javascript:|<script|```/iu.test(text)) throw Error('unsafe-model-text');
  const source = normalized(evidence), target = normalized(text);
  for (const term of target.match(/[a-z][a-z0-9_-]+|\d+(?:\.\d+)*/gu) ?? []) {
    if (!source.includes(term)) throw Error(reason);
  }
  if (/[\p{Script=Han}]/u.test(target) && !source.includes(target) && lexicalOverlap(target, source).score < 0.5) throw Error(reason);
}

/** Strict format + task-bound handle + deterministic evidence/constraint
 * checks. This is deliberately conservative; it is not a semantic quality
 * certificate and never authorizes automatic application. */
export function validateModelOutput(reply, {payload: rawPayload, handleMap, pack, overlay, currentVersions, currentReferences = pack.references}) {
  if (reply?.state !== 'complete') throw Error('model-' + (reply?.state ?? 'invalid-transport'));
  const payload = validateProviderPayload(rawPayload), output = validateModelSchema(reply.json);
  if (digest(payload) !== handleMap.payloadDigest || output.requestNonce !== payload.requestNonce || output.requestNonce !== handleMap.requestNonce) throw Error('request-mismatch');
  if (pack.scope.key !== overlay.scopeKey || handleMap.scopeKey !== overlay.scopeKey || handleMap.inputDigest !== pack.versions.evidenceDigest) throw Error('scope-mismatch');
  if (pack.versions.overlayRevision !== overlay.revision) throw Error('stale-overlay');
  if (!sameVersions(pack.versions, currentVersions)) throw Error('stale-input');
  const get = (handle, kind) => { const item = handleMap.handles.get(handle); if (!item || item.kind !== kind) throw Error('unknown-' + kind + '-handle'); return item.id; };
  const seen = new Set(), constraints = Object.values(overlay.constraints ?? {});
  return output.items.map(item => {
    const refId = get(item.conversationHandle, 'conversation');
    if (seen.has(refId)) throw Error('duplicate-conversation-result'); seen.add(refId);
    const input = payload.items.find(entry => entry.handle === item.conversationHandle);
    if (!input) throw Error('conversation-not-in-payload');
    const original = pack.references.find(ref => ref.id === refId), current = currentReferences.find(ref => ref.id === refId);
    if (!original || !current || !current.available || current.freshness !== 'current' || digest(original) !== digest(current)) throw Error('stale-native-reference');
    if (constraints.some(c => c.kind === 'exclude-ai-processing' && c.refId === refId)) throw Error('processing-excluded');
    if (new Set(item.evidenceHandles).size !== item.evidenceHandles.length) throw Error('duplicate-evidence-handle');
    const evidenceIds = item.evidenceHandles.map(handle => {
      if (handle === item.conversationHandle) return handleMap.metadataEvidence.get(handle);
      const id = get(handle, 'evidence');
      if (handleMap.evidenceOwners.get(handle) !== refId || !input.approvedText.some(entry => entry.evidenceHandle === handle)) throw Error('cross-reference-evidence');
      return id;
    });
    if (evidenceIds.some(id => !id || !pack.evidenceIds.includes(id))) throw Error('evidence-not-in-pack');
    const evidence = [...(item.evidenceHandles.includes(item.conversationHandle) ? [input.approvedTitle, ...input.approvedAliases] : []),
      ...input.approvedText.filter(entry => item.evidenceHandles.includes(entry.evidenceHandle)).map(entry => entry.text)].join(' ');
    if (item.kind !== 'UNKNOWN' && current.membership.state === 'UNKNOWN') throw Error('unknown-membership');
    const assertTopic = handle => {
      const id = get(handle, 'topic'), topic = overlay.topics[id];
      if (!payload.candidateTopics.some(entry => entry.handle === handle) || !topic || topic.lifecycle !== 'active' || topic.scopeKey !== overlay.scopeKey) throw Error('stale-topic');
      if (constraints.some(c => c.kind === 'exclude-topic' && c.refId === refId && c.topicId === id)) throw Error('hard-pair-exclusion');
      const comparison = [topic.name, ...(topic.aliases ?? []), topic.intent?.object ?? '', topic.intent?.objective ?? ''].join(' ');
      if (!lexicalOverlap(evidence, comparison).common.length && !normalized(evidence).includes(normalized(topic.name))) throw Error('unsupported-topic-evidence');
      return id;
    };
    let resolved = {kind: item.kind, refId, titleSuggestion: item.titleSuggestion, evidenceIds,
      reason: item.reason, explanation: item.explanation, evidenceDigest: digest({refId, evidence})};
    if (item.titleSuggestion !== null) {
      if (!payload.allowedOperations.includes('name')) throw Error('operation-not-allowed');
      assertSupportedText(item.titleSuggestion, evidence, 'unsupported-title-evidence');
      const old = overlay.titles?.[refId];
      if (old?.control.mode === 'human' || old?.control.locked || old?.displayPreference === 'native') throw Error('human-title-protected');
    }
    if (item.kind !== 'UNKNOWN' && !payload.allowedOperations.includes('classify')) throw Error('operation-not-allowed');
    if (item.kind === 'EXISTING') resolved.topicId = assertTopic(item.topicHandle);
    if (item.kind === 'MULTI_TOPIC') {
      resolved.primary = assertTopic(item.primaryTopicHandle);
      resolved.related = item.relatedTopicHandles.map(assertTopic);
      if (new Set([resolved.primary, ...resolved.related]).size !== resolved.related.length + 1) throw Error('duplicate-topic-result');
    }
    if (item.kind === 'NEW_TOPIC') {
      if (!payload.allowedOperations.includes('propose-topic')) throw Error('operation-not-allowed');
      if (/^(其他|未分类|misc|other|general)$/iu.test(item.seed.name.trim())) throw Error('generic-topic-denied');
      for (const value of [item.seed.name, item.seed.object, item.seed.goal, item.seed.outcome, ...item.seed.qualifiers].filter(Boolean)) assertSupportedText(value, evidence, 'unsupported-topic-intent');
      if (!normalized(evidence).includes(normalized(item.seed.object))) throw Error('unsupported-topic-object');
      resolved.seed = structuredClone(item.seed);
    }
    return resolved;
  });
}
