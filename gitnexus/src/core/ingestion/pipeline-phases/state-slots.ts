/**
 * Phase: stateSlots
 *
 * Detects shared state slots (React Query / SWR cache keys, etc.), creates
 * StateSlot graph nodes, and connects producer/consumer functions via
 * PRODUCES / CONSUMES edges.
 *
 * Pure regex-based content scanning — no tree-sitter or worker dependency,
 * which is why it runs as its own phase rather than piggy-backing on parse.
 *
 * @deps    parse
 * @reads   allPaths (from parse)
 * @writes  graph (StateSlot nodes, PRODUCES + CONSUMES edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { readFileContents } from '../filesystem-walker.js';
import { detectStateSlots, type ExtractedStateSlot } from '../state-slot-detectors/index.js';
import { processStateSlots } from '../state-slot-processor.js';
import { isDev } from '../utils/env.js';

import { logger } from '../../logger.js';

export interface StateSlotsOutput {
  slotsCreated: number;
  producesEdges: number;
  consumesEdges: number;
  overlapWarnings: string[];
}

const STATE_SLOT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export const stateSlotsPhase: PipelinePhase<StateSlotsOutput> = {
  name: 'stateSlots',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<StateSlotsOutput> {
    const { allPaths } = getPhaseOutput<ParseOutput>(deps, 'parse');

    // Detectors only know about React Query / SWR for now; both are TS/JS.
    // Filtering up-front avoids reading any source we won't scan.
    const candidates = allPaths.filter((p) => {
      const dot = p.lastIndexOf('.');
      return dot !== -1 && STATE_SLOT_EXTENSIONS.has(p.slice(dot));
    });
    if (candidates.length === 0) {
      return { slotsCreated: 0, producesEdges: 0, consumesEdges: 0, overlapWarnings: [] };
    }

    const contents = await readFileContents(ctx.repoPath, candidates);
    const allSlots: ExtractedStateSlot[] = [];
    for (const [filePath, content] of contents) {
      if (!content) continue;
      const slots = detectStateSlots(content, filePath);
      if (slots.length > 0) allSlots.push(...slots);
    }

    if (allSlots.length === 0) {
      return { slotsCreated: 0, producesEdges: 0, consumesEdges: 0, overlapWarnings: [] };
    }

    const result = processStateSlots(allSlots, ctx.graph);

    if (isDev) {
      logger.info(
        `🧊 State-slot graph: ${result.slotsCreated} StateSlot nodes, ` +
          `${result.producesEdges} PRODUCES, ${result.consumesEdges} CONSUMES` +
          (result.overlapWarnings.length > 0
            ? `, ${result.overlapWarnings.length} overlap warning(s)`
            : ''),
      );
    }

    return result;
  },
};
