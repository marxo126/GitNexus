/**
 * Phase: parameters
 *
 * Materializes first-class Parameter nodes from extracted parameter records,
 * connects them back to their owning callable via CONTAINS edges, and
 * synthesises PASSES_TO edges from CALLS edges by position-matching call
 * args to callee parameters.
 *
 * @deps    parse, crossFile  (CALLS edges from cross-file resolution must be
 *                             finalised before PASSES_TO synthesis)
 * @reads   allParameters (from parse), graph CALLS edges
 * @writes  graph (Parameter nodes, CONTAINS edges, PASSES_TO edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { generateId } from '../../../lib/utils.js';
import {
  buildCalleeParamMap,
  buildPassesToEdges,
  createParameterNodes,
  type CallEdgeRecord,
} from '../parameter-processor.js';
import { isDev } from '../utils/env.js';

import { logger } from '../../logger.js';

export interface ParametersOutput {
  paramNodes: number;
  containsEdges: number;
  passesToEdges: number;
}

export const parametersPhase: PipelinePhase<ParametersOutput> = {
  name: 'parameters',
  deps: ['parse', 'crossFile'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<ParametersOutput> {
    const { allParameters } = getPhaseOutput<ParseOutput>(deps, 'parse');
    if (allParameters.length === 0) {
      return { paramNodes: 0, containsEdges: 0, passesToEdges: 0 };
    }

    const records = createParameterNodes(allParameters);
    let containsEdges = 0;

    for (const r of records) {
      if (!ctx.graph.getNode(r.ownerId)) continue;

      ctx.graph.addNode({
        id: r.id,
        label: 'Parameter',
        properties: {
          name: r.name,
          filePath: r.filePath,
          paramIndex: r.paramIndex,
          declaredType: r.declaredType,
          isRest: r.isRest,
          startLine: r.line,
          endLine: r.line,
        },
      });

      ctx.graph.addRelationship({
        id: generateId('CONTAINS', `${r.ownerId}->${r.id}`),
        sourceId: r.ownerId,
        targetId: r.id,
        type: 'CONTAINS',
        confidence: 1.0,
        reason: 'parameter-declaration',
      });
      containsEdges++;
    }

    const calleeParamMap = buildCalleeParamMap(allParameters);
    const callEdges: CallEdgeRecord[] = [];
    for (const rel of ctx.graph.iterRelationshipsByType('CALLS')) {
      if (rel.argCount === undefined || rel.argCount <= 0) continue;
      if (!calleeParamMap.has(rel.targetId)) continue;
      callEdges.push({
        id: rel.id,
        callerId: rel.sourceId,
        calleeId: rel.targetId,
        argCount: rel.argCount,
        confidence: rel.confidence,
        reason: rel.reason,
      });
    }
    const passesToList = buildPassesToEdges(callEdges, calleeParamMap);

    let passesToEdges = 0;
    const seenPassesTo = new Set<string>();
    for (const edge of passesToList) {
      if (seenPassesTo.has(edge.id)) continue;
      seenPassesTo.add(edge.id);
      if (!ctx.graph.getNode(edge.paramId)) continue;
      if (!ctx.graph.getNode(edge.callerId)) continue;
      ctx.graph.addRelationship({
        id: edge.id,
        sourceId: edge.callerId,
        targetId: edge.paramId,
        type: 'PASSES_TO',
        confidence: edge.confidence,
        reason: edge.reason,
        step: edge.argIndex,
      });
      passesToEdges++;
    }

    if (isDev) {
      logger.info(
        `📐 Parameter graph: ${records.length} parameters, ${containsEdges} CONTAINS, ${passesToEdges} PASSES_TO`,
      );
    }

    return { paramNodes: records.length, containsEdges, passesToEdges };
  },
};
