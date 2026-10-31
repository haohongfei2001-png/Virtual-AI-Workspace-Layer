import {digest} from '../../data/hash.mjs';
import {boundedJSON, boundedText, integer, exact} from '../model/schema-runtime.mjs';

export function wilsonInterval(successes, total, z = 1.959963984540054) {
  integer(successes); integer(total); if (successes > total) throw Error('invalid-binomial-counts');
  if (!Number.isFinite(z) || z <= 0 || z > 10) throw Error('invalid-confidence-interval');
  if (total === 0) return {low: 0, high: 1};
  const p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return {low: Math.max(0, center - radius), high: Math.min(1, center + radius)};
}
const lanes = ['existing-topic', 'new-topic', 'related', 'derived-title'];
const modelFields = ['modelVersion', 'promptVersion', 'outputSchemaVersion'];
function qualityBinding(input) {
  const binding = boundedJSON(input, {maxBytes: 4096});
  exact(binding, modelFields, ['profileId', 'modelProfileId', 'providerProfileId']);
  Object.values(binding).forEach(value => boundedText(value, 128));
  return binding;
}

/** A report is untrusted data even when it came from storage. This verifies its
 * complete arithmetic and digest; it does not establish data provenance or
 * approve a model. That separate decision must remain in the trusted owner. */
export function validateQualityReport(input) {
  const report = boundedJSON(input, {maxBytes: 65536});
  exact(report, ['schema', 'modelBinding', 'naturalSampleCount', 'syntheticSampleCount', 'disagreements', 'leakage', 'cohortComplete',
    'eligibleCount', 'automaticCount', 'coverage', 'mandatoryCounterexamplesPassed', 'lanes', 'datasetDigest', 'status', 'reportDigest']);
  if (report.schema !== 'vaiwl-pro-quality/1' || !['evaluated-unapproved', 'synthetic-only-not-quality-evidence'].includes(report.status)) throw Error('invalid-quality-report');
  qualityBinding(report.modelBinding);
  for (const name of ['naturalSampleCount', 'syntheticSampleCount', 'disagreements', 'eligibleCount', 'automaticCount']) integer(report[name], 20000);
  if (report.naturalSampleCount + report.syntheticSampleCount > 20000 || report.disagreements > report.naturalSampleCount ||
      report.automaticCount > report.eligibleCount || (report.cohortComplete && report.eligibleCount > report.naturalSampleCount) ||
      report.status !== (report.naturalSampleCount ? 'evaluated-unapproved' : 'synthetic-only-not-quality-evidence')) throw Error('invalid-quality-counts');
  for (const name of ['leakage', 'cohortComplete', 'mandatoryCounterexamplesPassed']) if (typeof report[name] !== 'boolean') throw Error('invalid-quality-report');
  for (const name of ['datasetDigest', 'reportDigest']) if (!/^[a-f0-9]{64}$/u.test(report[name])) throw Error('invalid-quality-digest');
  const {reportDigest, ...body} = report;
  if (reportDigest !== digest(body)) throw Error('quality-report-digest-mismatch');
  const fraction = value => Number.isFinite(value) && value >= 0 && value <= 1;
  if (!fraction(report.coverage) || Math.abs(report.coverage - (report.eligibleCount ? report.automaticCount / report.eligibleCount : 0)) > 1e-12) throw Error('invalid-quality-coverage');
  exact(report.lanes, lanes);
  let decisions = 0;
  for (const name of lanes) {
    const lane = report.lanes[name];
    exact(lane, ['n', 'correct', 'precision', 'interval', 'coverage', 'qualified']);
    integer(lane.n, 20000); integer(lane.correct, lane.n); decisions += lane.n;
    exact(lane.interval, ['low', 'high']);
    const interval = wilsonInterval(lane.correct, lane.n), precision = lane.n ? lane.correct / lane.n : 0;
    if (!fraction(lane.precision) || !fraction(lane.coverage) || !fraction(lane.interval.low) || !fraction(lane.interval.high) ||
        Math.abs(lane.precision - precision) > 1e-12 || Math.abs(lane.interval.low - interval.low) > 1e-12 ||
        Math.abs(lane.interval.high - interval.high) > 1e-12 || typeof lane.qualified !== 'boolean') throw Error('invalid-quality-lane');
    const threshold = name === 'derived-title' ? 0.9 : 0.98;
    if (lane.qualified && !(report.naturalSampleCount >= 1000 && lane.n >= 200 && precision >= threshold && interval.low >= threshold &&
        report.mandatoryCounterexamplesPassed && !report.leakage && report.cohortComplete)) throw Error('unqualified-quality-lane');
  }
  if (decisions !== report.automaticCount) throw Error('invalid-quality-counts');
  return report;
}

/** Executable evaluation gates, not a bundled natural-language benchmark.
 * Synthetic counterexamples never count toward natural quality/coverage.
 * The resulting report is data; an owner-held quality ticket is still needed. */
export function evaluateDataset({samples, modelBinding, eligibleCohortIds, mandatoryCounterexamplesPassed = false}) {
  modelBinding = qualityBinding(modelBinding);
  const data = boundedJSON(samples, {maxBytes: 8 * 1024 * 1024, maxNodes: 300000});
  if (!Array.isArray(data) || data.length > 20000) throw Error('invalid-evaluation-data');
  if (!Array.isArray(eligibleCohortIds) || eligibleCohortIds.length > 20000 || new Set(eligibleCohortIds).size !== eligibleCohortIds.length) throw Error('invalid-cohort');
  eligibleCohortIds.forEach(value => boundedText(value, 128));
  const seen = new Set(), splitGroups = new Map();
  let leakage = false;
  for (const row of data) {
    boundedText(row.id, 128);
    if (seen.has(row.id)) throw Error('duplicate-evaluation-id'); seen.add(row.id);
    if (!lanes.includes(row.lane) || !['development', 'calibration', 'final'].includes(row.split) ||
        !['natural-consented', 'natural-public-licensed', 'synthetic'].includes(row.provenance) || typeof row.correct !== 'boolean' ||
        !['automatic', 'suggestion', 'unknown'].includes(row.decision) || typeof row.eligible !== 'boolean') throw Error('invalid-evaluation-row');
    for (const kind of ['userGroup', 'objectGroup', 'seriesGroup', 'timePartition']) {
      boundedText(row[kind], 128);
      const key = kind + ':' + row[kind];
      if (splitGroups.has(key) && splitGroups.get(key) !== row.split) leakage = true;
      splitGroups.set(key, row.split);
    }
    if (!Array.isArray(row.annotators) || row.annotators.length !== 2 || row.annotators[0] === row.annotators[1] || typeof row.annotationAgreement !== 'boolean') throw Error('independent-annotation-required');
    row.annotators.forEach(id => boundedText(id, 128));
    if (row.costMicros !== undefined) integer(row.costMicros);
    if (row.latencyMs !== undefined && (!Number.isFinite(row.latencyMs) || row.latencyMs < 0)) throw Error('invalid-latency');
  }
  const natural = data.filter(row => row.provenance !== 'synthetic');
  const finals = natural.filter(row => row.split === 'final' && row.annotationAgreement);
  const cohort = new Set(eligibleCohortIds), cohortComplete = eligibleCohortIds.every(id => finals.some(row => row.id === id && row.eligible)) &&
    natural.filter(row => row.split === 'final' && row.eligible).every(row => cohort.has(row.id));
  const auto = finals.filter(row => row.eligible && row.decision === 'automatic' && cohort.has(row.id));
  const laneReports = Object.fromEntries(lanes.map(lane => {
    const eligible = finals.filter(row => row.lane === lane && row.eligible && cohort.has(row.id));
    const decisions = eligible.filter(row => row.decision === 'automatic');
    const correct = decisions.filter(row => lane === 'derived-title' ? row.correct && row.directlyAccepted === true : row.correct).length;
    const n = decisions.length, precision = n ? correct / n : 0, interval = wilsonInterval(correct, n), threshold = lane === 'derived-title' ? 0.9 : 0.98;
    return [lane, {n, correct, precision, interval, coverage: eligible.length ? n / eligible.length : 0,
      qualified: natural.length >= 1000 && n >= 200 && precision >= threshold && interval.low >= threshold &&
        mandatoryCounterexamplesPassed === true && !leakage && cohortComplete}];
  }));
  const report = {schema: 'vaiwl-pro-quality/1', modelBinding: structuredClone(modelBinding), naturalSampleCount: natural.length,
    syntheticSampleCount: data.length - natural.length, disagreements: natural.filter(row => !row.annotationAgreement).length,
    leakage, cohortComplete, eligibleCount: cohort.size, automaticCount: auto.length,
    coverage: cohort.size ? auto.length / cohort.size : 0, mandatoryCounterexamplesPassed: mandatoryCounterexamplesPassed === true,
    lanes: laneReports, datasetDigest: digest(data), status: natural.length ? 'evaluated-unapproved' : 'synthetic-only-not-quality-evidence'};
  return {...report, reportDigest: digest(report)};
}

export function evaluateFindability({nativeTimesMs, proTimesMs, nativeErrors, proErrors, participantCount}) {
  if (!Array.isArray(nativeTimesMs) || !Array.isArray(proTimesMs) || nativeTimesMs.length !== proTimesMs.length ||
      [...nativeTimesMs, ...proTimesMs].some(value => !Number.isFinite(value) || value < 0)) throw Error('invalid-findability-data');
  integer(nativeErrors); integer(proErrors); integer(participantCount);
  if (nativeErrors > nativeTimesMs.length || proErrors > proTimesMs.length || participantCount > nativeTimesMs.length) throw Error('invalid-findability-counts');
  const median = values => { const sorted = [...values].sort((a, b) => a - b); const n = sorted.length; return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null; };
  const nativeMedianMs = median(nativeTimesMs), proMedianMs = median(proTimesMs);
  const improvement = nativeMedianMs > 0 ? 1 - proMedianMs / nativeMedianMs : null;
  return {tasks: nativeTimesMs.length, participantCount, nativeMedianMs, proMedianMs, improvement,
    targetMet: nativeTimesMs.length >= 60 && participantCount >= 12 && improvement >= 0.2 && proErrors <= nativeErrors};
}
