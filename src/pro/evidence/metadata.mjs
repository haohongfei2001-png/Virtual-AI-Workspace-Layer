import {digest, stable} from '../../data/hash.mjs';
import {boundedJSON, exact, integer, boundedText} from '../model/schema-runtime.mjs';
import {recallTopics} from '../organize/recall.mjs';

export function validateRevisionVector(input) {
  const v = boundedJSON(input, {maxBytes: 65536});
  exact(v, ['scopeKey', 'authorizationEpoch', 'sourceGeneration', 'nativeFields', 'overlayRevision', 'targets', 'constraintRevision', 'policyVersion', 'evidenceDigest']);
  boundedText(v.scopeKey, 1024); boundedText(v.policyVersion, 128); boundedText(v.evidenceDigest, 256);
  if (!/^[a-f0-9]{64}$/u.test(v.evidenceDigest)) throw Error('invalid-evidence-digest');
  for (const key of ['authorizationEpoch', 'overlayRevision', 'constraintRevision']) integer(v[key]);
  for (const key of ['sourceGeneration', 'nativeFields', 'targets']) {
    if (!v[key] || Array.isArray(v[key]) || typeof v[key] !== 'object') throw Error('invalid-version-map');
    for (const [id, revision] of Object.entries(v[key])) { boundedText(id, 1024); integer(revision); }
  }
  return v;
}
export function sameVersions(a, b) {
  return stable(validateRevisionVector(a)) === stable(validateRevisionVector(b));
}
export function validateSourceScope(input) {
  const scope = boundedJSON(input, {maxBytes: 2048});
  const personal = scope.kind === 'browser-local-personal';
  exact(scope, ['kind', 'key', 'serverIdentity', 'persistence', ...(personal ? ['selectionRequired'] : [])]);
  boundedText(scope.key, 1024);
  if (scope.kind === 'browser-local-session') {
    if (scope.persistence !== 'memory' || scope.serverIdentity !== 'not-established') throw Error('invalid-session-scope');
  } else if (personal) {
    if (scope.persistence !== 'same-idb' || scope.serverIdentity !== 'not-established' || scope.selectionRequired !== true) throw Error('invalid-personal-scope');
  } else if (scope.kind !== 'verified-scope' || scope.persistence !== 'same-idb' || scope.serverIdentity !== 'established') throw Error('invalid-scope');
  return scope;
}
export function validateNativeRef(input) {
  const ref = boundedJSON(input, {maxBytes: 8192});
  exact(ref, ['id', 'nativeTitle', 'nativeUrl', 'membership', 'available', 'freshness', 'nativeRevision', 'sourceIds']);
  boundedText(ref.id, 128); boundedText(ref.nativeTitle, 400);
  if (ref.nativeUrl !== null) boundedText(ref.nativeUrl, 2048);
  if (typeof ref.available !== 'boolean' || !['current', 'last-known', 'revalidation-needed'].includes(ref.freshness)) throw Error('invalid-ref');
  integer(ref.nativeRevision);
  if (!Array.isArray(ref.sourceIds) || ref.sourceIds.length > 32) throw Error('invalid-source-ids');
  ref.sourceIds.forEach(id => boundedText(id, 128));
  const membership = ref.membership;
  if (membership.state === 'NONE') exact(membership, ['state', 'evidenceId', 'revision']);
  else if (membership.state === 'PROJECT') { exact(membership, ['state', 'projectId', 'evidenceId', 'revision']); boundedText(membership.projectId, 128); }
  else if (membership.state === 'UNKNOWN') { exact(membership, ['state', 'reason', 'revision']); boundedText(membership.reason, 200); }
  else throw Error('invalid-membership');
  integer(membership.revision);
  if (membership.state !== 'UNKNOWN') boundedText(membership.evidenceId, 256);
  return ref;
}
export function validateCapabilities(input) {
  const capabilities = boundedJSON(input, {maxBytes: 8192});
  exact(capabilities, ['scope', 'metadata', 'positiveNone', 'selectedText', 'sentUserInput', 'historicalCompleteness', 'reasonCodes']);
  validateSourceScope(capabilities.scope);
  for (const key of ['metadata', 'positiveNone', 'selectedText', 'sentUserInput']) if (!['available', 'unavailable'].includes(capabilities[key])) throw Error('invalid-capability');
  if (!['partial', 'known-domain-complete'].includes(capabilities.historicalCompleteness) || !Array.isArray(capabilities.reasonCodes) || capabilities.reasonCodes.length > 100) throw Error('invalid-capability');
  capabilities.reasonCodes.forEach(reason => boundedText(reason, 200));
  return capabilities;
}
export function metadataEvidenceId(metadata) {
  return 'meta_' + digest({refId: metadata.refId, nativeTitle: metadata.nativeTitle, humanAliases: metadata.humanAliases});
}

/** Pure projection of an already owner-authorized bounded snapshot. It neither
 * authenticates a source nor upgrades membership/capability from user input. */
export function prepareMetadataEvidence({scope: rawScope, capabilities, references, versions: rawVersions, overlay, consent,
  refIds = null, candidateTopicIds = null, maxUtf8Bytes = 32768, mode = 'pro-default-none', selectedProjectIds = []}) {
  const scope = validateSourceScope(rawScope), versions = validateRevisionVector(rawVersions);
  capabilities = validateCapabilities(capabilities);
  if (scope.key !== versions.scopeKey || overlay.scopeKey !== scope.key || capabilities.scope?.key !== scope.key) throw Error('scope-mismatch');
  if (versions.overlayRevision !== overlay.revision) throw Error('stale-overlay');
  if (capabilities.metadata !== 'available' || !['local', 'cloud'].includes(consent?.mode) || !consent.inputKinds?.includes('metadata')) throw Error('metadata-not-authorized');
  if (!['pro-default-none', 'pro-cross-project'].includes(mode)) throw Error('invalid-processing-mode');
  if (!Array.isArray(selectedProjectIds) || selectedProjectIds.length > 100 || new Set(selectedProjectIds).size !== selectedProjectIds.length) throw Error('invalid-selected-projects');
  selectedProjectIds.forEach(id => boundedText(id, 128));
  if (scope.persistence === 'memory' && consent.mode !== 'local') throw Error('session-cloud-denied');
  integer(maxUtf8Bytes, 32768);
  if (maxUtf8Bytes < 256 || !Array.isArray(references) || references.length > 1000) throw Error('invalid-input-bound');
  if (refIds !== null && (!Array.isArray(refIds) || refIds.length > 10 || new Set(refIds).size !== refIds.length)) throw Error('invalid-ref-query');
  const excluded = new Set(Object.values(overlay.constraints ?? {}).filter(c => c.kind === 'exclude-ai-processing').map(c => c.refId));
  const refs = references.map(validateNativeRef);
  if (new Set(refs.map(r => r.id)).size !== refs.length) throw Error('duplicate-reference');
  const filtered = refs.filter(ref => (!refIds || refIds.includes(ref.id)) && ref.available && ref.freshness === 'current' && !excluded.has(ref.id) &&
    ((ref.membership.state === 'NONE' && capabilities.positiveNone === 'available') ||
      (mode === 'pro-cross-project' && ref.membership.state === 'PROJECT' && selectedProjectIds.includes(ref.membership.projectId))));
  const selected = filtered.slice(0, 10);
  const metadata = selected.map(ref => ({refId: ref.id, nativeTitle: ref.nativeTitle,
    humanAliases: overlay.titles?.[ref.id]?.control.mode === 'human' ? [...(overlay.titles[ref.id].aliases ?? [])].slice(0, 100) : []}));
  const candidateIds = candidateTopicIds ?? [...new Set(selected.flatMap(ref => recallTopics(ref, overlay).map(item => item.topicId)))];
  if (!Array.isArray(candidateIds) || candidateIds.some(id => !overlay.topics?.[id] || overlay.topics[id].scopeKey !== scope.key || overlay.topics[id].lifecycle !== 'active')) throw Error('invalid-candidate-topics');
  const pack = {format: 'vaiwl-pro-evidence/1', packId: 'pack_' + digest([scope.key, versions, selected.map(ref => ref.id)]),
    scope, versions, references: selected, knownCandidateTopicIds: [...new Set(candidateIds)].slice(0, 20),
    missing: ['body', 'author', 'continuation', ...(capabilities.historicalCompleteness !== 'known-domain-complete' ? ['history'] : []),
      ...(refs.some(ref => ref.membership.state === 'UNKNOWN') || capabilities.positiveNone !== 'available' ? ['membership'] : [])],
    truncated: filtered.length > selected.length, evidenceIds: metadata.map(metadataEvidenceId), inputLevel: 'metadata-only', metadata};
  if (new TextEncoder().encode(stable(pack)).byteLength > maxUtf8Bytes) throw Error('evidence-pack-too-large');
  return pack;
}

export function authorizeContentPack(metadataPack, content, {capabilities, consent}) {
  if (metadataPack.scope.kind.startsWith('browser-local')) throw Error('browser-local-content-unavailable');
  if (!Array.isArray(content) || content.length > 30) throw Error('invalid-content');
  const refs = new Set(metadataPack.references.map(ref => ref.id));
  const copied = boundedJSON(content, {maxBytes: 24576});
  for (const item of copied) {
    if (!refs.has(item.refId)) throw Error('content-reference-mismatch');
    boundedText(item.evidenceId, 256); boundedText(item.text, 6000);
    if (item.kind === 'verified-sent-user-input') {
      exact(item, ['kind', 'evidenceId', 'refId', 'text', 'messageId', 'sourceId', 'originalAuthorVerified']);
      if (capabilities.sentUserInput !== 'available' || !consent.inputKinds.includes('sent-user-input') || item.originalAuthorVerified !== true) throw Error('sent-input-unavailable');
      boundedText(item.messageId, 128); boundedText(item.sourceId, 128);
    } else if (item.kind === 'explicit-selected-text') {
      exact(item, ['kind', 'evidenceId', 'refId', 'text', 'role', 'anchor']);
      if (capabilities.selectedText !== 'available' || !consent.inputKinds.includes('selected-text') || !['user', 'unknown'].includes(item.role)) throw Error('selected-text-unavailable');
      if (item.anchor.kind === 'unanchored') { exact(item.anchor, ['kind', 'reason']); boundedText(item.anchor.reason, 200); }
      else { exact(item.anchor, ['kind', 'messageId', 'branchId', 'bodyHash']); if (item.anchor.kind !== 'verified-message') throw Error('invalid-anchor'); for (const k of ['messageId', 'branchId', 'bodyHash']) boundedText(item.anchor[k], 256); }
    } else throw Error('unsupported-content-kind');
  }
  if (new Set(copied.map(item => item.evidenceId)).size !== copied.length) throw Error('duplicate-content-evidence');
  const pack = {...structuredClone(metadataPack), inputLevel: 'authorized-content', content: copied,
    evidenceIds: [...metadataPack.evidenceIds, ...copied.map(item => item.evidenceId)]};
  if (new TextEncoder().encode(stable(pack)).byteLength > 32768) throw Error('evidence-pack-too-large');
  return pack;
}
