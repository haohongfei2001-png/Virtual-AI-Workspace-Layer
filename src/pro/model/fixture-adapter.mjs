import {validateProviderPayload} from './payload.mjs';
import {lexicalOverlap} from '../organize/recall.mjs';

/** Deterministic, offline fixture/rule baseline. NOT a model and NOT evidence of
 * natural Chinese classification quality. No provider call or automatic ticket. */
export function createFixtureModelAdapter() {
  return Object.freeze({id: 'fixture-rules', productionAI: false, async execute(_ticket, rawPayload, signal) {
    if (signal?.aborted) return {state: 'not-dispatched', reason: 'cancelled'};
    const payload = validateProviderPayload(rawPayload);
    const items = payload.items.map(item => {
      const ranked = payload.candidateTopics.map(topic => {
        const text = [topic.approvedName, topic.approvedIntentSummary ?? ''].join(' ');
        const overlap = lexicalOverlap(item.approvedTitle, text);
        return {topic, score: overlap.score, literal: item.approvedTitle.toLocaleLowerCase().includes(topic.approvedName.toLocaleLowerCase()), common: overlap.common.length};
      }).filter(item => item.literal || item.common >= 2).sort((a, b) => Number(b.literal) - Number(a.literal) || b.score - a.score || a.topic.handle.localeCompare(b.topic.handle));
      const base = {conversationHandle: item.handle, titleSuggestion: null, evidenceHandles: [item.handle],
        reason: 'same-object-goal', explanation: '本地规则按获准标题与主题名称匹配，请核对后再收录。'};
      if (ranked[0] && (!ranked[1] || Number(ranked[0].literal) > Number(ranked[1].literal) || ranked[0].score - ranked[1].score >= 0.15))
        return {...base, kind: 'EXISTING', topicHandle: ranked[0].topic.handle};
      // Explicit object/task punctuation only. Unstructured names do not cause
      // new-topic speculation; the native title remains reachable.
      const seed = /^([^：:·]{2,40})[：:·]\s*([^：:·]{2,60})$/u.exec(item.approvedTitle);
      if (!ranked.length && seed) return {...base, kind: 'NEW_TOPIC', reason: 'distinct-goal',
        seed: {name: item.approvedTitle, object: seed[1].trim(), goal: seed[2].trim(), outcome: null, qualifiers: []}};
      return {kind: 'UNKNOWN', conversationHandle: item.handle, titleSuggestion: null, evidenceHandles: [],
        reason: 'insufficient-evidence', explanation: '现有标题不足以确定主题，保留原名。'};
    });
    return {state: 'complete', json: {schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: payload.requestNonce, items},
      providerRequestId: null, usage: null};
  }});
}
