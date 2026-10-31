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

/** Explicit version disagreement is evidence against a lexical match. Generic
 * words such as “开发” must not turn v1.2 into v2.0. A comparison mentioning both
 * versions remains reviewable; this is a guard, not semantic understanding. */
export function conflictingVersions(a, b) {
  const versions = text => new Set((String(text).normalize('NFKC').toLocaleLowerCase('en-US')
    .match(/(?<![a-z0-9])(?:[vr]\s*\d+(?:\.\d+)*|\d+(?:\.\d+)+)(?![a-z0-9])/gu) ?? [])
    .map(term => term.replace(/\s+/gu, '').replace(/^v/u, '')));
  const left = versions(a), right = versions(b);
  return left.size > 0 && right.size > 0 && ![...left].some(term => right.has(term));
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
      return {topicId: topic.id, score: conflictingVersions(title, candidates.join(' ')) ? 0 : overlap.score + (literal ? 1 : 0) + (neighbors.has(topic.id) ? 0.5 : 0),
        reasons: [...(literal ? ['literal-name-or-alias'] : []), ...(overlap.common.length ? ['shared-lexical-features'] : []), ...(neighbors.has(topic.id) ? ['confirmed-series-neighbor'] : [])]};
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.topicId.localeCompare(b.topicId)).slice(0, limit);
}
