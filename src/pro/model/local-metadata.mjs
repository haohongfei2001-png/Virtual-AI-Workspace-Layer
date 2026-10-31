import {validateProviderPayload} from './payload.mjs';
import {lexicalOverlap, conflictingVersions} from '../organize/recall.mjs';

const normalize = value => value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
const generic = /^(继续|再想想|新对话|新聊天|其他|未分类|工作|项目|开发|设计|研究|讨论|misc|other|general|new chat)$/iu;

/** Production local rules, deliberately separate from fixture-rules. No cloud,
 * model, download, native action or automatic application. Only supplied names
 * and aliases are used. Weak/ambiguous matches keep the original conversation.
 * Results pass the same schema/evidence/current-version checks as cloud output. */
export function createLocalMetadataAdapter() {
  return Object.freeze({id: 'local-metadata-rules/1', productionAI: false, network: false,
    async execute(_ticket, rawPayload, signal) {
      if (signal?.aborted) return {state: 'not-dispatched', reason: 'cancelled'};
      const payload = validateProviderPayload(rawPayload);
      const items = payload.items.map(item => {
        const title = [item.approvedTitle, ...item.approvedAliases].join(' '), source = normalize(title);
        const ranked = payload.candidateTopics.map(topic => {
          const name = normalize(topic.approvedName), comparison = [topic.approvedName, topic.approvedIntentSummary ?? ''].join(' ');
          const overlap = lexicalOverlap(title, comparison), literal = name.length >= 2 && !generic.test(name) && source.includes(name);
          const supported = !generic.test(source) && !conflictingVersions(title, comparison) &&
            (literal || (overlap.common.length >= 3 && overlap.score >= 0.75));
          return {topic, supported, literal, score: overlap.score + (literal ? 1 : 0)};
        }).filter(row => row.supported).sort((a, b) => b.score - a.score || a.topic.handle.localeCompare(b.topic.handle));
        const base = {conversationHandle: item.handle, titleSuggestion: null, evidenceHandles: [item.handle],
          reason: 'same-object-goal', explanation: '本地规则仅按原名和人工别名找到候选，请核对后再收录。'};
        if (ranked[0] && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.25))
          return {...base, kind: 'EXISTING', topicHandle: ranked[0].topic.handle};
        const seed = /^([^：:·]{2,40})[：:·]\s*([^：:·]{2,60})$/u.exec(item.approvedTitle);
        if (!ranked.length && seed && !generic.test(seed[1].trim()) && !generic.test(seed[2].trim())) return {...base,
          kind: 'NEW_TOPIC', reason: 'distinct-goal', explanation: '标题明确写出对象和任务，可据此建立主题；请先核对。',
          seed: {name: item.approvedTitle, object: seed[1].trim(), goal: seed[2].trim(), outcome: null, qualifiers: []}};
        return {kind: 'UNKNOWN', conversationHandle: item.handle, titleSuggestion: null, evidenceHandles: [],
          reason: 'insufficient-evidence', explanation: ranked.length > 1 ? '多个主题同样接近，请人工选择；现有整理保持不变。' : '现有名称不足以确定主题，保留原名。'};
      });
      return {state: 'complete', json: {schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: payload.requestNonce, items},
        providerRequestId: null, usage: null};
    }});
}
