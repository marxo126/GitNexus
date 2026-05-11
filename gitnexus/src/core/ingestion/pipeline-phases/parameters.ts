/**
 * Phase: parameters
 *
 * Materializes first-class Parameter nodes from extracted parameter records
 * and connects them back to their owning callable via CONTAINS edges.
 *
 * @deps    parse
 * @reads   allParameters (from parse)
 * @writes  graph (Parameter nodes, CONTAINS edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { generateId } from '../../../lib/utils.js';
import { createParameterNodes } from '../parameter-processor.js';
import { isDev } from '../utils/env.js';

import { logger } from '../../logger.js';

export interface ParametersOutput {
  paramNodes: number;
  containsEdges: number;
}

export const parametersPhase: PipelinePhase<ParametersOutput> = {
  name: 'parameters',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<ParametersOutput> {
    const { allParameters } = getPhaseOutput<ParseOutput>(deps, 'parse');
    if (allParameters.length === 0) {
      return { paramNodes: 0, containsEdges: 0 };
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

    if (isDev) {
      logger.info(
        `📐 Parameter graph: ${records.length} parameters, ${containsEdges} CONTAINS edges`,
      );
    }

    return { paramNodes: records.length, containsEdges };
  },
};
