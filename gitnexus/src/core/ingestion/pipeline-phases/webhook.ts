/**
 * Phase: webhook
 *
 * Processes webhook/event handler definitions and creates Webhook nodes
 * with TRIGGERS edges from the handler file.
 *
 * @deps    parse
 * @reads   allWebhooks (from parse)
 * @writes  graph (Webhook nodes, TRIGGERS edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { generateId } from '../../../lib/utils.js';
import type { ExtractedWebhook } from '../workers/parse-worker.js';
import type { KnowledgeGraph } from '../../graph/types.js';
import { isDev } from '../utils/env.js';

export interface WebhookOutput {
  webhookCount: number;
}

export const webhookPhase: PipelinePhase<WebhookOutput> = {
  name: 'webhook',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<WebhookOutput> {
    const { allWebhooks } = getPhaseOutput<ParseOutput>(deps, 'parse');

    if (allWebhooks.length === 0) {
      return { webhookCount: 0 };
    }

    return processWebhooks(ctx.graph, allWebhooks);
  },
};

function processWebhooks(
  graph: KnowledgeGraph,
  webhooks: readonly ExtractedWebhook[],
): WebhookOutput {
  const seenWebhookNames = new Set<string>();
  let webhookCount = 0;

  for (const wh of webhooks) {
    if (seenWebhookNames.has(wh.name)) continue;
    seenWebhookNames.add(wh.name);

    const webhookNodeId = generateId('Webhook', wh.name);
    graph.addNode({
      id: webhookNodeId,
      label: 'Webhook',
      properties: {
        name: wh.name,
        filePath: wh.filePath,
        kind: wh.kind,
        eventTypes: wh.eventTypes,
      },
    });

    const handlerFileId = generateId('File', wh.filePath);
    graph.addRelationship({
      id: generateId('TRIGGERS', `${handlerFileId}->${webhookNodeId}`),
      sourceId: handlerFileId,
      targetId: webhookNodeId,
      type: 'TRIGGERS',
      confidence: 1.0,
      reason: `webhook-handler:${wh.kind}`,
    });
    webhookCount++;
  }

  if (isDev) {
    console.log(`Webhook detection: ${webhookCount} webhooks detected`);
  }

  return { webhookCount };
}
