/**
 * Phase: swiftui-navigation
 *
 * Processes extracted SwiftUI navigation patterns and creates NAVIGATES_TO edges.
 *
 * @deps    parse
 * @reads   allNavigations (from parse)
 * @writes  graph (NAVIGATES_TO edges)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { processSwiftUINavigation } from '../call-processor.js';
import { isDev } from '../utils/env.js';

export interface SwiftUINavigationOutput {
  edgesCreated: number;
}

export const swiftuiNavigationPhase: PipelinePhase<SwiftUINavigationOutput> = {
  name: 'swiftui-navigation',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<SwiftUINavigationOutput> {
    const { allNavigations } = getPhaseOutput<ParseOutput>(deps, 'parse');

    if (!allNavigations || allNavigations.length === 0) {
      return { edgesCreated: 0 };
    }

    const edgesCreated = processSwiftUINavigation(ctx.graph, allNavigations as any[]);

    if (isDev) {
      console.log(
        `SwiftUI navigation: ${edgesCreated} NAVIGATES_TO edges from ${allNavigations.length} patterns`,
      );
    }

    return { edgesCreated };
  },
};
