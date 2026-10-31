import {digest, stable} from '../../data/hash.mjs';
import {sameVersions} from '../evidence/metadata.mjs';
import {semanticActionDigest} from '../domain/schema.mjs';
import {validateQualityReport} from './evaluation.mjs';
export {semanticActionDigest} from '../domain/schema.mjs';

const values = object => Object.values(object ?? {});
const activePrimary = (overlay, refId) => values(overlay.placements).find(p => p.conversationId === refId && p.role === 'primary' && p.state === 'included');
const intentMeaning = intent => intent ? {object: intent.object, objective: intent.objective, expectedOutcome: intent.expectedOutcome} : null;
export function sealSuggestion(proposal) {
  const {planHash: _ignored, ...data} = proposal;
  return {...data, planHash: digest(data)};
}

const qualityReasons = ({firstRun = true, quality = null, modelProfile = null, autoRequested = false}) => {
  const reasons = [];
  let report = null;
  try { if (quality?.report) report = validateQualityReport(quality.report); } catch { /* Invalid evidence never opens an automatic lane. */ }
  if (firstRun !== false) reasons.push('first-run-preview');
  if (autoRequested !== true) reasons.push('automatic-mode-not-selected');
  if (!quality || quality.approvedByOwner !== true || report?.status !== 'evaluated-unapproved' ||
      report.naturalSampleCount < 1000 || report.leakage || !report.cohortComplete || !report.mandatoryCounterexamplesPassed) reasons.push('quality-unapproved');
  const profileId = modelProfile?.profileId ?? modelProfile?.id;
  if (!modelProfile || report?.modelBinding?.modelVersion !== (modelProfile.modelVersion ?? modelProfile.frozenModelVersion) ||
      report?.modelBinding?.promptVersion !== modelProfile.promptVersion || report?.modelBinding?.outputSchemaVersion !== modelProfile.outputSchemaVersion ||
      (report?.modelBinding?.profileId !== undefined && report.modelBinding.profileId !== profileId) ||
      (report?.modelBinding?.modelProfileId !== undefined && report.modelBinding.modelProfileId !== profileId) ||
      (report?.modelBinding?.providerProfileId !== undefined && report.modelBinding.providerProfileId !== modelProfile.providerProfileId) ||
      !modelProfile.qualityGateReference || modelProfile.qualityGateReference !== (quality?.reference ?? report?.reportDigest)) reasons.push('quality-model-mismatch');
  return {reasons, report};
};

/** Status describes a current trusted policy, not permission to apply any
 * particular item. The full proposal gate and owner transaction still run. */
export function automaticReadiness(options) {
  const {reasons, report} = qualityReasons(options);
  const lanes = Object.entries(report?.lanes ?? {}).filter(([_key, value]) => value.qualified === true).map(([key]) => key);
  if (!lanes.length) reasons.push('lane-quality-gate');
  return {eligible: reasons.length === 0, lanes, reasons: [...new Set(reasons)]};
}

/** Quality qualification and authority are different: this only decides if a
 * proposal may ask the owner for a one-use auto ticket. No ticket is created. */
export function automaticGate(proposal, {overlay, pack, firstRun = true, quality = null, modelProfile = null, autoRequested = false}) {
  const {reasons, report} = qualityReasons({firstRun, quality, modelProfile, autoRequested});
  if (pack.truncated === true) reasons.push('truncated-input-review-required');
  let lane = proposal.kind === 'existing-topic' && proposal.role === 'related' ? 'related' : proposal.kind;
  if (!['existing-topic', 'related', 'new-topic', 'derived-title'].includes(lane)) reasons.push('review-only-operation');
  if (report?.lanes?.[lane]?.qualified !== true) reasons.push('lane-quality-gate');
  const refIds = proposal.members ?? (proposal.refId ? [proposal.refId] : []);
  for (const refId of refIds) {
    const ref = pack.references.find(r => r.id === refId);
    if (!ref || !ref.available || ref.freshness !== 'current' || ref.membership.state === 'UNKNOWN') reasons.push('ineligible-reference');
    if (activePrimary(overlay, refId)) reasons.push('stable-primary');
    const title = overlay.titles?.[refId];
    if (proposal.kind === 'derived-title' && title) reasons.push('stable-title');
  }
  if (proposal.topicId) {
    const target = overlay.topics[proposal.topicId];
    if (target?.membershipControl?.locked || target?.membershipControl?.mode === 'human') reasons.push('human-membership-protected');
  }
  if (pack.scope.persistence === 'memory') reasons.push('session-preview-only');
  return {eligible: reasons.length === 0, lane, reasons: [...new Set(reasons)]};
}

/** Produce sealed contract proposals only. The overlay/journal is not mutated;
 * the owning commit port must recheck all versions and current authority. */
export function planSuggestions({validated, pack, overlay, modelProfile = null, quality = null, firstRun = true, autoRequested = false, currentVersions = pack.versions}) {
  if (overlay.scopeKey !== pack.scope.key || pack.versions.overlayRevision !== overlay.revision || !sameVersions(pack.versions, currentVersions)) throw Error('stale-input');
  const proposals = [], diagnostics = [], newTopicSources = new Map();
  const constraints = values(overlay.constraints);
  const model = modelProfile ? {profileId: modelProfile.profileId ?? modelProfile.id,
    modelVersion: modelProfile.modelVersion ?? modelProfile.frozenModelVersion, promptVersion: modelProfile.promptVersion,
    outputSchemaVersion: modelProfile.outputSchemaVersion} : null;
  const add = (specific, item) => {
    const actionDigest = semanticActionDigest(specific);
    // Metadata spelling changes alone are not proof of new substantive work.
    // A rejected same-target metadata proposal stays suppressed. New separately
    // authorized content may establish a different evidence digest.
    const fingerprint = digest({actionDigest, evidenceDigest: item.evidenceDigest});
    if (constraints.some(c => c.kind === 'reject-proposal' && (c.proposalFingerprint === fingerprint ||
        (c.targetDigest === actionDigest && (pack.inputLevel === 'metadata-only' || c.evidenceDigest === item.evidenceDigest))))) {
      diagnostics.push({refId: item.refId, reason: 'previously-rejected'}); return;
    }
    if (specific.kind === 'new-topic') {
      const intentDigest = digest(specific.intent);
      if (values(overlay.tombstones).some(tombstone => tombstone.intentDigest === intentDigest || tombstone.evidenceDigest === item.evidenceDigest || tombstone.proposalFingerprints?.includes(fingerprint) ||
          (overlay.topics[tombstone.topicId]?.intent && stable(intentMeaning(overlay.topics[tombstone.topicId].intent)) === stable(intentMeaning(specific.intent))))) {
        diagnostics.push({refId: item.refId, reason: 'deleted-topic-suppressed'}); return;
      }
    }
    const base = {...specific, id: 'proposal_' + digest({fingerprint, versions: pack.versions}), fingerprint,
      versions: structuredClone(pack.versions), evidenceIds: [...item.evidenceIds], model,
      summary: specific.kind === 'derived-title' ? '整理标题建议' : specific.kind === 'new-topic' ? '新建主题建议' : '主题收录建议',
      rationale: [item.explanation, ...(pack.inputLevel === 'metadata-only' ? ['仅依据获准标题与人工别名，未读取正文。'] : [])], qualityBand: 'review'};
    const gate = automaticGate(base, {overlay, pack, firstRun, quality, modelProfile, autoRequested});
    base.qualityBand = gate.eligible ? 'eligible-auto' : 'review';
    const proposal = sealSuggestion(base); proposals.push(proposal);
    diagnostics.push({refId: item.refId, reason: gate.eligible ? 'owner-ticket-required' : 'preview-required', gates: gate.reasons});
    return proposal;
  };
  for (const item of validated) {
    if (item.kind === 'UNKNOWN') { diagnostics.push({refId: item.refId, reason: item.reason}); continue; }
    if (constraints.some(c => c.kind === 'exclude-ai-processing' && c.refId === item.refId)) { diagnostics.push({refId: item.refId, reason: 'processing-excluded'}); continue; }
    const primary = activePrimary(overlay, item.refId);
    if (item.kind === 'EXISTING') {
      if (primary?.topicId !== item.topicId) add({kind: 'existing-topic', refId: item.refId, topicId: item.topicId, role: 'primary'}, item);
    } else if (item.kind === 'MULTI_TOPIC') {
      add({kind: 'multi-topic', refId: item.refId, primary: item.primary, related: [...item.related]}, item);
    } else if (item.kind === 'NEW_TOPIC') {
      const intent = {object: item.seed.object, objective: item.seed.goal, expectedOutcome: item.seed.outcome, evidenceIds: [...item.evidenceIds]};
      const proposal = add({kind: 'new-topic', draftKey: 'draft_' + digest([item.refId, intent]), name: item.seed.name, intent, members: [item.refId]}, item);
      if (proposal) newTopicSources.set(proposal.id, item);
    }
    if (item.titleSuggestion !== null && overlay.titles?.[item.refId]?.title !== item.titleSuggestion) {
      const title = overlay.titles?.[item.refId];
      if (title?.control.mode === 'human' || title?.control.locked || title?.displayPreference === 'native') diagnostics.push({refId: item.refId, reason: 'human-title-protected'});
      else add({kind: 'derived-title', refId: item.refId, title: item.titleSuggestion}, item);
    }
  }
  // One model response can identify several conversations as exactly the same
  // new work. Apply per-reference exclusion/rejection/deletion checks above
  // BEFORE combining them. Exact seed fields only: different names, versions,
  // goals or outcomes never become an unsolicited fuzzy merge.
  const groups = new Map();
  for (const proposal of proposals) if (proposal.kind === 'new-topic') {
    const key = digest({name: proposal.name, ...intentMeaning(proposal.intent)});
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(proposal);
  }
  for (const group of groups.values()) if (group.length > 1) {
    const groupIds = new Set(group.map(p => p.id));
    for (let i = proposals.length - 1; i >= 0; i--) if (groupIds.has(proposals[i].id)) proposals.splice(i, 1);
    const items = group.map(p => newTopicSources.get(p.id)).sort((a, b) => a.refId.localeCompare(b.refId));
    const members = items.map(item => item.refId), evidenceIds = [...new Set(items.flatMap(item => item.evidenceIds))];
    const intent = {...group[0].intent, evidenceIds};
    const combined = {...items[0], evidenceIds, evidenceDigest: digest(items.map(item => ({refId: item.refId, evidenceDigest: item.evidenceDigest})))};
    const merged = add({kind: 'new-topic', draftKey: 'draft_' + digest([members, intent]), name: group[0].name, intent, members}, combined);
    if (merged) {
      const rationale = [...new Set([...merged.rationale, ...items.map(item => item.explanation)])];
      proposals[proposals.indexOf(merged)] = sealSuggestion({...merged, rationale});
    }
  }
  return {proposals, diagnostics};
}

export function incrementalCacheKey({pack, modelProfile, policyVersion, targetVersions}) {
  return digest({scopeKey: pack.scope.key, authorizationEpoch: pack.versions.authorizationEpoch,
    sourceGeneration: pack.versions.sourceGeneration, evidenceDigest: pack.versions.evidenceDigest,
    inputDigest: digest({metadata: pack.metadata, content: pack.content ?? []}), modelProfile,
    policyVersion, targetVersions, constraintRevision: pack.versions.constraintRevision});
}

/** A bounded RAM cache, invalidated on revoke. No prompt or raw model text is
 * persisted; changing epoch/scope/capability cannot reuse cached authorization. */
export function createSuggestionCache(maxEntries = 100) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) throw Error('invalid-cache-bound');
  const entries = new Map();
  return {get(key, scopeKey, epoch) { const value = entries.get(key); return value && value.scopeKey === scopeKey && value.epoch === epoch ? structuredClone(value.result) : null; },
    set(key, scopeKey, epoch, result) { entries.delete(key); entries.set(key, {scopeKey, epoch, result: structuredClone(result)}); while (entries.size > maxEntries) entries.delete(entries.keys().next().value); },
    revoke(scopeKey) { for (const [key, value] of entries) if (value.scopeKey === scopeKey) entries.delete(key); }, clear() { entries.clear(); }};
}
