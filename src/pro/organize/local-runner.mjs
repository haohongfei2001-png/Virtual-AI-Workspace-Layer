import {buildProviderPayload} from '../model/payload.mjs';
import {validateModelOutput} from '../model/validate.mjs';
import {createLocalMetadataAdapter} from '../model/local-metadata.mjs';
import {planSuggestions} from './planner.mjs';

/** Production local entry has no dependency on the fixture adapter. It never
 * qualifies an automatic lane, performs network work or claims model quality. */
export async function runLocalMetadataSuggestions({pack, overlay, firstRun = true, signal, currentVersions = pack.versions}) {
  if (signal?.aborted) return {proposals: [], diagnostics: [{reason: 'cancelled'}], adapter: 'local-metadata-rules/1', quality: 'not-model-evaluated'};
  if (!pack.metadata.length) return {proposals: [], diagnostics: [{reason: 'no-eligible-metadata'}], adapter: 'local-metadata-rules/1', quality: 'not-model-evaluated'};
  const {payload, handleMap, truncated} = buildProviderPayload(pack, overlay);
  const reply = await createLocalMetadataAdapter().execute(null, payload, signal);
  if (signal?.aborted) throw Error('cancelled');
  const validated = validateModelOutput(reply, {payload, handleMap, pack, overlay, currentVersions});
  const result = planSuggestions({validated, pack, overlay, firstRun, currentVersions});
  if (truncated) result.diagnostics.push({reason: 'provider-input-truncated'});
  return {...result, adapter: 'local-metadata-rules/1', quality: 'not-model-evaluated'};
}
