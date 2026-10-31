import {buildSeriesPlan} from '../domain/index.mjs';
import {array, exact, id, oneOf, record, sameVersions, text, uint, validateOverlay} from '../domain/schema.mjs';

/** Expand one bounded human edit against worker-owned current data. Reuse the
 * existing sealed Series plan and transaction; a frame never replaces a graph
 * assembled from partial pages. Display order, edges and labels are independent.
 */
export function buildSeriesEditPlan(input, {state, snapshot, expected}) {
  exact(input, ['seriesId', 'change']);id(input.seriesId);
  validateOverlay(state);
  if (snapshot?.authorized === false || state.scopeKey !== snapshot?.versions?.scopeKey || !sameVersions(expected, snapshot.versions)) throw Error('stale-series-edit');
  const current = state.series[input.seriesId];
  if (!current || state.topics[current.topicId]?.lifecycle !== 'active') throw Error('series-unavailable');
  const next = structuredClone(current), change = record(input.change);
  const entry = refId => {id(refId);if (!next.entries.includes(refId)) throw Error('series-entry-unavailable');return refId;};
  switch (change?.kind) {
    case 'rename':
      exact(change, ['kind', 'title']);next.title = text(change.title);break;
    case 'insert': {
      exact(change, ['kind', 'refId', 'beforeRefId']);id(change.refId);
      if (next.entries.includes(change.refId)) throw Error('duplicate-series-entry');
      if (!snapshot.references.some(r=>r.id===change.refId&&r.available) || !Object.values(state.placements).some(p=>p.topicId===current.topicId&&p.conversationId===change.refId&&p.state==='included')) throw Error('series-entry-outside-topic');
      const index = change.beforeRefId === null ? next.entries.length : next.entries.indexOf(entry(change.beforeRefId));
      next.entries.splice(index, 0, change.refId);
      next.labels.push({refId:change.refId, sequence:null, source:'human-confirmed'});
      break;
    }
    case 'remove': {
      exact(change, ['kind', 'refId', 'removeIncidentEdges']);entry(change.refId);
      if (change.removeIncidentEdges !== true) throw Error('series-edge-removal-confirmation-required');
      next.entries = next.entries.filter(refId=>refId!==change.refId);
      next.edges = next.edges.filter(edge=>edge.from!==change.refId&&edge.to!==change.refId);
      next.labels = next.labels.filter(label=>label.refId!==change.refId);
      break;
    }
    case 'move': {
      exact(change, ['kind', 'refId', 'direction']);entry(change.refId);oneOf(change.direction, ['up', 'down']);
      const from = next.entries.indexOf(change.refId), to = from + (change.direction === 'up' ? -1 : 1);
      if (to < 0 || to >= next.entries.length) throw Error('series-order-boundary');
      [next.entries[from], next.entries[to]] = [next.entries[to], next.entries[from]];
      break;
    }
    case 'set-edge':
    case 'remove-edge': {
      exact(change, ['kind', 'from', 'to', 'relation']);entry(change.from);entry(change.to);oneOf(change.relation, ['continuation', 'branch']);
      const matches = edge=>edge.from===change.from&&edge.to===change.to&&edge.kind===change.relation;
      if (change.kind === 'remove-edge') {
        if (!next.edges.some(matches)) throw Error('series-edge-unavailable');
        next.edges = next.edges.filter(edge=>!matches(edge));
      } else {
        if (next.edges.some(matches)) throw Error('duplicate-series-edge');
        next.edges.push({kind:change.relation, from:change.from, to:change.to});
      }
      break;
    }
    case 'set-label': {
      exact(change, ['kind', 'refId', 'sequence']);entry(change.refId);
      if (change.sequence !== null) {array(change.sequence,12);if (!change.sequence.length) throw Error('invalid-sequence');change.sequence.forEach(uint);}
      next.labels = next.labels.filter(label=>label.refId!==change.refId);
      next.labels.push({refId:change.refId, sequence:structuredClone(change.sequence), source:'human-confirmed'});
      break;
    }
    default: throw Error('invalid-series-edit');
  }
  return buildSeriesPlan({seriesId:next.id, topicId:next.topicId, title:next.title, entries:next.entries, edges:next.edges, labels:next.labels, expected}, {
    knownRefs:snapshot.references.map(ref=>ref.id), topicId:current.topicId, currentSeries:current, versions:snapshot.versions,
  });
}
