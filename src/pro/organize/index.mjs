export {prepareMetadataEvidence, authorizeContentPack, validateRevisionVector, sameVersions} from '../evidence/metadata.mjs';
export {recallTopics, lexicalTerms, lexicalOverlap} from './recall.mjs';
export {buildProviderPayload, validateProviderPayload} from '../model/payload.mjs';
export {validateModelOutput, validateModelSchema} from '../model/validate.mjs';
export {createFixtureModelAdapter} from '../model/fixture-adapter.mjs';
export {createLocalMetadataAdapter} from '../model/local-metadata.mjs';
export {runLocalMetadataSuggestions} from './local-runner.mjs';
export {planMetadataBatch, metadataBatchCursorKey} from './metadata-batch.mjs';
export {planSuggestions, sealSuggestion, automaticGate, automaticReadiness, semanticActionDigest, incrementalCacheKey, createSuggestionCache} from './planner.mjs';
export {evaluateDataset, validateQualityReport, wilsonInterval, evaluateFindability} from './evaluation.mjs';

import {buildProviderPayload} from '../model/payload.mjs';
import {validateModelOutput} from '../model/validate.mjs';
import {createFixtureModelAdapter} from '../model/fixture-adapter.mjs';
import {planSuggestions} from './planner.mjs';

export async function runLocalSuggestions({pack, overlay, firstRun = true, signal, currentVersions = pack.versions}) {
  if (!pack.metadata.length) return {proposals: [], diagnostics: [{reason: 'no-eligible-metadata'}], adapter: 'fixture-rules', quality: 'not-evaluated'};
  const {payload, handleMap} = buildProviderPayload(pack, overlay);
  const reply = await createFixtureModelAdapter().execute(null, payload, signal);
  const validated = validateModelOutput(reply, {payload, handleMap, pack, overlay, currentVersions});
  const result = planSuggestions({validated, pack, overlay, firstRun, currentVersions});
  return {...result, adapter: 'fixture-rules', quality: 'not-evaluated'};
}
