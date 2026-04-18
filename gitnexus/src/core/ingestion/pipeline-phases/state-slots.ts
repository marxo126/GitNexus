/**
 * Phase: stateSlots
 *
 * Detects state slot patterns (React Query, SWR, Redux, Zustand, tRPC, etc.)
 * across all source files and creates StateSlot nodes + PRODUCES/CONSUMES edges.
 *
 * @deps    crossFile
 * @reads   scannedFiles (file paths + sizes), graph (symbol nodes for edge creation)
 * @writes  graph (StateSlot nodes, PRODUCES edges, CONSUMES edges)
 * @output  slotsCreated, producesEdges, consumesEdges, overlapWarnings
 */

import { readFile } from 'node:fs/promises';
import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { StructureOutput } from './structure.js';
import { detectStateSlots } from '../state-slot-detectors/index.js';
import { processStateSlots, type StateSlotProcessorResult } from '../state-slot-processor.js';
import { isDev } from '../utils/env.js';

export interface StateSlotsOutput {
  stateSlotsResult: StateSlotProcessorResult;
}

export const stateSlotsPhase: PipelinePhase<StateSlotsOutput> = {
  name: 'stateSlots',
  deps: ['crossFile'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<StateSlotsOutput> {
    const { scannedFiles, totalFiles } = getPhaseOutput<StructureOutput>(deps, 'structure');

    ctx.onProgress({
      phase: 'state-slots',
      percent: 92,
      message: 'Detecting state slots...',
      stats: { filesProcessed: 0, totalFiles, nodesCreated: ctx.graph.nodeCount },
    });

    // Run detectors over all files
    const allSlots = [];
    let filesProcessed = 0;

    for (const file of scannedFiles) {
      let content: string;
      try {
        content = await readFile(file.path, 'utf8');
      } catch {
        continue;
      }
      const slots = detectStateSlots(content, file.path);
      if (slots.length > 0) allSlots.push(...slots);
      filesProcessed++;
    }

    ctx.onProgress({
      phase: 'state-slots',
      percent: 93,
      message: `Processing ${allSlots.length} state slot(s)...`,
      stats: { filesProcessed, totalFiles, nodesCreated: ctx.graph.nodeCount },
    });

    const stateSlotsResult = processStateSlots(allSlots, ctx.graph);

    if (isDev) {
      console.log(
        `🗂  State slots: ${stateSlotsResult.slotsCreated} slots, ` +
        `${stateSlotsResult.producesEdges} PRODUCES, ` +
        `${stateSlotsResult.consumesEdges} CONSUMES, ` +
        `${stateSlotsResult.overlapWarnings.length} overlap warnings`,
      );
    }

    return { stateSlotsResult };
  },
};
