import {digest} from '../../data/hash.mjs';
import {validateRevisionVector} from '../evidence/metadata.mjs';
import {boundedText, integer} from '../model/schema-runtime.mjs';

const maximumReferences = 100000;
const uniqueIds = (rows, field) => {
  if (!Array.isArray(rows) || rows.length > maximumReferences) throw Error('invalid-metadata-batch');
  const ids = rows.map(row => { boundedText(row?.[field], 128); return row[field]; });
  if (new Set(ids).size !== ids.length) throw Error('duplicate-metadata-batch-reference');
  return ids;
};

/** The owner supplies an already eligible, authorized reference sequence.
 * Optional metadata is an allow-list, never a source of ordering or authority.
 * Finishing a pass returns an empty final batch; the caller must deliberately
 * start a new pass when its source/constraint/mode cursor changes. Unknown or
 * rejected model outputs still consume their slot and cannot starve later rows.
 * No source text is copied into the returned owner-private cursor metadata. */
export function planMetadataBatch({references, metadata = null, offset = 0, limit = 10}) {
  integer(offset, maximumReferences); integer(limit, 10);
  if (limit === 0) throw Error('invalid-metadata-batch-limit');
  const canonical = uniqueIds(references, 'id'), known = new Set(canonical);
  const allowed = metadata === null ? known : new Set(uniqueIds(metadata, 'refId'));
  for (const id of allowed) if (!known.has(id)) throw Error('unknown-metadata-batch-reference');
  const eligible = metadata === null ? canonical : canonical.filter(id => allowed.has(id));
  const start = Math.min(offset, eligible.length), refIds = eligible.slice(start, start + limit);
  const nextOffset = start + refIds.length;
  return {refIds, offset: start, nextOffset, total: eligible.length, hasMore: nextOffset < eligible.length};
}

/** Session cursor binding is separate from an authorization grant. The full
 * revision vector invalidates progress after native evidence, human edits,
 * exclusions, policy, targets or source authority change. Project selection is
 * a set, so presentation order alone does not restart completed work. */
export function metadataBatchCursorKey({versions, mode, selectedProjectIds = [], processing = 'local'}) {
  if (!['pro-default-none', 'pro-cross-project'].includes(mode) || !['local', 'cloud'].includes(processing)) throw Error('invalid-metadata-batch-mode');
  if (!Array.isArray(selectedProjectIds) || selectedProjectIds.length > 100) throw Error('invalid-selected-projects');
  const projects = selectedProjectIds.map(id => { boundedText(id, 128); return id; });
  if (new Set(projects).size !== projects.length) throw Error('invalid-selected-projects');
  return digest({versions: validateRevisionVector(versions), mode, selectedProjectIds: projects.sort(), processing});
}
