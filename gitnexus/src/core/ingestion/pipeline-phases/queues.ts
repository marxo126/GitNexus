/**
 * Phase: queues
 *
 * Processes async queue patterns (BullMQ + Temporal) and creates
 * ENQUEUES / PROCESSES edges and Queue CodeElement nodes.
 *
 * @deps    parse
 * @reads   allQueuePatterns (from parse)
 * @writes  graph (CodeElement nodes, ENQUEUES/PROCESSES edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { generateId } from '../../../lib/utils.js';
import type { ExtractedQueuePattern } from '../workers/parse-worker.js';
import type { KnowledgeGraph } from '../../graph/types.js';
import { isDev } from '../utils/env.js';

export interface QueuesOutput {
  queuesCreated: number;
  edgesCreated: number;
}

export const queuesPhase: PipelinePhase<QueuesOutput> = {
  name: 'queues',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<QueuesOutput> {
    const { allQueuePatterns } = getPhaseOutput<ParseOutput>(deps, 'parse');

    if (allQueuePatterns.length === 0) {
      return { queuesCreated: 0, edgesCreated: 0 };
    }

    return processQueuePatterns(ctx.graph, allQueuePatterns);
  },
};

function processQueuePatterns(
  graph: KnowledgeGraph,
  patterns: readonly ExtractedQueuePattern[],
): QueuesOutput {
  const queueNodes = new Map<string, string>();
  const seenEdges = new Set<string>();
  let edgesCreated = 0;

  for (const pt of patterns) {
    let queueNodeId = queueNodes.get(pt.queueName);
    if (!queueNodeId) {
      queueNodeId = generateId('CodeElement', `Queue:${pt.queueName}`);
      graph.addNode({
        id: queueNodeId,
        label: 'CodeElement',
        properties: {
          name: pt.queueName,
          filePath: '',
          description: `Queue: ${pt.queueName}`,
        },
      });
      queueNodes.set(pt.queueName, queueNodeId);
    }

    const edgeType =
      pt.role === 'producer' || pt.role === 'workflow' ? 'ENQUEUES' : 'PROCESSES';
    const fileId = generateId('File', pt.filePath);
    const edgeKey = `${fileId}->${queueNodeId}:${edgeType}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    graph.addRelationship({
      id: generateId(edgeType, edgeKey),
      sourceId: fileId,
      targetId: queueNodeId,
      type: edgeType,
      confidence: 0.9,
      reason: `queue-${pt.role}`,
    });
    edgesCreated++;
  }

  if (isDev) {
    console.log(
      `Queues: ${edgesCreated} edges (ENQUEUES/PROCESSES), ${queueNodes.size} queue nodes (${patterns.length} total patterns)`,
    );
  }

  return { queuesCreated: queueNodes.size, edgesCreated };
}
