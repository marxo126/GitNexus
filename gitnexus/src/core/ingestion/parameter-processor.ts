/**
 * Parameter Processor
 *
 * Pure helpers that materialize first-class Parameter nodes (and CONTAINS edges
 * from their owning callable) from per-file `ExtractedParameter` records
 * emitted by the parse worker, plus PASSES_TO edge synthesis from CALLS edges
 * by position-matching call args to callee parameters. The pipeline phase in
 * `pipeline-phases/parameters.ts` orchestrates calls into here and applies the
 * results to the graph.
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

export interface PassesToEdge {
  id: string;
  /** Caller node ID — the enclosing Function/Method/Constructor at the call-site. */
  callerId: string;
  /** Parameter node ID being filled by an argument. */
  paramId: string;
  /** Zero-based position at the call-site this edge represents. */
  argIndex: number;
  /** Inherited from the parent CALLS edge. */
  confidence: number;
  reason: string;
}

/** Index parameters by owner, sorted ascending by paramIndex. Multiple records
 *  for the same `(ownerId, paramIndex)` collapse — last write wins after the
 *  worker-side dedup, which is good enough for positional matching. */
export function buildCalleeParamMap(
  params: readonly ExtractedParameter[],
): Map<string, ExtractedParameter[]> {
  const byOwner = new Map<string, ExtractedParameter[]>();
  for (const p of params) {
    if (!p.name) continue;
    let arr = byOwner.get(p.ownerId);
    if (!arr) {
      arr = [];
      byOwner.set(p.ownerId, arr);
    }
    arr.push(p);
  }
  for (const arr of byOwner.values()) {
    arr.sort((a, b) => a.paramIndex - b.paramIndex);
  }
  return byOwner;
}

export interface CallEdgeRecord {
  /** CALLS edge ID (used only to seed the PASSES_TO edge id for uniqueness). */
  id: string;
  callerId: string;
  calleeId: string;
  argCount: number;
  confidence: number;
  reason: string;
}

/**
 * Build PASSES_TO edges by matching call-site positional args to callee
 * parameters. For a non-rest param at position `i`, emit an edge when
 * `i < argCount`. When the callee's last param is rest (`...args`), every
 * supplied arg ≥ rest-position routes to that single rest param.
 *
 * Calls with no argCount or to callees with no params produce no edges.
 */
export function buildPassesToEdges(
  callEdges: readonly CallEdgeRecord[],
  calleeParamMap: ReadonlyMap<string, readonly ExtractedParameter[]>,
): PassesToEdge[] {
  const out: PassesToEdge[] = [];
  for (const call of callEdges) {
    if (!call.argCount || call.argCount <= 0) continue;
    const params = calleeParamMap.get(call.calleeId);
    if (!params || params.length === 0) continue;

    const restParam = params[params.length - 1].isRest ? params[params.length - 1] : undefined;
    const restPos = restParam ? params.length - 1 : -1;

    for (let i = 0; i < call.argCount; i++) {
      let target: ExtractedParameter | undefined;
      if (i < params.length && !(i === restPos && restParam)) {
        target = params[i];
      } else if (restParam && i >= restPos) {
        target = restParam;
      }
      if (!target) continue;
      const paramId = buildParameterId(target.ownerId, target.name, target.paramIndex);
      out.push({
        id: generateId('PASSES_TO', `${call.callerId}->${paramId}#${i}`),
        callerId: call.callerId,
        paramId,
        argIndex: i,
        confidence: call.confidence,
        reason: `${call.reason || 'call'}|arg:${i}`,
      });
    }
  }
  return out;
}
