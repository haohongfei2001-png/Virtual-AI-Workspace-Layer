import {evaluateDataset} from '../../../src/pro/organize/evaluation.mjs';

/** FABRICATED report arithmetic for trusted-owner control flow tests only.
 * These rows are not natural observations, a model-quality result, approval,
 * a benchmark, or a report that may be shipped in production configuration. */
export function syntheticQualityFixture({profileId = 'synthetic_profile', modelVersion = 'synthetic_model', promptVersion = 'synthetic_prompt',
  outputSchemaVersion = 'vaiwl-pro-model-output/1'} = {}) {
  const samples = Array.from({length: 1000}, (_, i) => ({id: 'mock_quality_' + i, lane: ['existing-topic', 'new-topic', 'related', 'derived-title'][i % 4],
    split: 'final', provenance: 'natural-consented', decision: 'automatic', eligible: true, correct: true, directlyAccepted: true,
    userGroup: 'u_' + i, objectGroup: 'o_' + i, seriesGroup: 's_' + i, timePartition: 't_' + i, annotators: ['a', 'b'], annotationAgreement: true}));
  const report = evaluateDataset({samples, modelBinding: {profileId, modelVersion, promptVersion, outputSchemaVersion},
    eligibleCohortIds: samples.map(row => row.id), mandatoryCounterexamplesPassed: true});
  return {approvedByOwner: true, report};
}
