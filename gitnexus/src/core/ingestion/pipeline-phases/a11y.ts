/**
 * Phase: a11y
 *
 * Runs WCAG rule engine over JSX elements extracted during parse and
 * creates A11ySignal nodes + HAS_A11Y_SIGNAL edges in the graph.
 *
 * @deps    parse
 * @reads   allJsxElements (from parse)
 * @writes  graph (A11ySignal nodes, HAS_A11Y_SIGNAL edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { runA11yRules } from '../a11y-rules/index.js';
import { processA11ySignals } from '../a11y-processor.js';

export interface A11yOutput {
  signalsCreated: number;
  edgesCreated: number;
  violations: number;
  needsReview: number;
}

export const a11yPhase: PipelinePhase<A11yOutput> = {
  name: 'a11y',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<A11yOutput> {
    const { allJsxElements } = getPhaseOutput<ParseOutput>(deps, 'parse');

    if (allJsxElements.length === 0) {
      return { signalsCreated: 0, edgesCreated: 0, violations: 0, needsReview: 0 };
    }

    // Group elements by file so each rule gets the correct filePath context
    const byFile = new Map<string, typeof allJsxElements[number][]>();
    for (const el of allJsxElements) {
      const bucket = byFile.get(el.filePath);
      if (bucket) {
        bucket.push(el);
      } else {
        byFile.set(el.filePath, [el]);
      }
    }

    const allSignals = [];
    for (const [filePath, elements] of byFile) {
      const signals = runA11yRules(elements, filePath);
      for (const s of signals) allSignals.push(s);
    }

    if (allSignals.length === 0) {
      return { signalsCreated: 0, edgesCreated: 0, violations: 0, needsReview: 0 };
    }

    return processA11ySignals(allSignals, ctx.graph);
  },
};
