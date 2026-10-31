import {integer} from '../model/schema-runtime.mjs';

export function lexicalTerms(text) {
  const normalized = String(text).normalize('NFKC').toLocaleLowerCase('en-US');
  const result = new Set(normalized.match(/[a-z][a-z0-9_-]*|\d+(?:\.\d+)+/gu) ?? []);
  for (const group of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let width = 2; width <= Math.min(3, group.length); width++) {
      for (let i = 0; i <= group.length - width; i++) result.add(group.slice(i, i + width));
    }
  }
  return result;
}
export function lexicalOverlap(a, b) {
  const x = lexicalTerms(a), y = lexicalTerms(b);
  const common = [...x].filter(term => y.has(term));
  return {common, score: common.length / Math.max(1, Math.min(x.size, y.size))};
}
export function recallTopics(ref, overlay, {limit = 20} = {}) {
  integer(limit, 20);
  const title = [ref.nativeTitle, ...(overlay.titles?.[ref.id]?.aliases ?? [])].join(' ');
  const exclusions = new Set(Object.values(overlay.constraints ?? {})
    .filter(c => c.kind === 'exclude-topic' && c.refId === ref.id).map(c => c.topicId));
  const neighbors = new Set(Object.values(overlay.series ?? {}).filter(s => s.entries.includes(ref.id)).map(s => s.topicId));
  return Object.values(overlay.topics ?? {}).filter(topic => topic.scopeKey === overlay.scopeKey &&
    topic.lifecycle === 'active' && !exclusions.has(topic.id)).map(topic => {
      const candidates = [topic.name, ...(topic.aliases ?? []), topic.intent?.object ?? '', topic.intent?.objective ?? ''];
      const overlap = lexicalOverlap(title, candidates.join(' '));
      const literal = candidates.some(name => name.trim().length >= 2 && title.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
      return {topicId: topic.id, score: overlap.score + (literal ? 1 : 0) + (neighbors.has(topic.id) ? 0.5 : 0),
        reasons: [...(literal ? ['literal-name-or-alias'] : []), ...(overlap.common.length ? ['shared-lexical-features'] : []), ...(neighbors.has(topic.id) ? ['confirmed-series-neighbor'] : [])]};
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.topicId.localeCompare(b.topicId)).slice(0, limit);
}
