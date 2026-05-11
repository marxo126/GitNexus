/**
 * Parameter Processor
 *
 * Pure helpers that materialize first-class Parameter nodes (and CONTAINS edges
 * from their owning callable) from per-file `ExtractedParameter` records
 * emitted by the parse worker. The pipeline phase in
 * `pipeline-phases/parameters.ts` orchestrates calls into here and applies the
 * results to the graph.
 *
 * PASSES_TO synthesis (matching call-site arg positions to callee parameters)
 * is intentionally deferred — it requires `argCount` on CALLS edges, which is
 * not yet persisted by call-processor. Adding the Parameter nodes alone is
 * enough to unlock downstream consumers that key off label='Parameter'.
 */

import { generateId } from '../../lib/utils.js';
import type { ExtractedParameter } from './workers/parse-worker.js';

export interface ParameterNodeRecord {
  id: string;
  ownerId: string;
  name: string;
  filePath: string;
  paramIndex: number;
  declaredType: string;
  isRest: boolean;
  line: number;
}

/** Stable ID derived from `(ownerId, name, paramIndex)`. Same params produce
 *  the same id across re-indexes, which lets re-runs upsert cleanly. */
export const buildParameterId = (ownerId: string, name: string, paramIndex: number): string =>
  generateId('Parameter', `${ownerId}:${name}:${paramIndex}`);

/** Convert raw ExtractedParameter records to canonical ParameterNodeRecords,
 *  deduplicating by id. Same parameter emitted from two extraction sites
 *  (chained method/function paths) is normalised to one node. */
export function createParameterNodes(params: readonly ExtractedParameter[]): ParameterNodeRecord[] {
  const out: ParameterNodeRecord[] = [];
  const seen = new Set<string>();
  for (const p of params) {
    if (!p.name) continue;
    const id = buildParameterId(p.ownerId, p.name, p.paramIndex);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      ownerId: p.ownerId,
      name: p.name,
      filePath: p.filePath,
      paramIndex: p.paramIndex,
      declaredType: p.declaredType,
      isRest: p.isRest,
      line: p.line,
    });
  }
  return out;
}
