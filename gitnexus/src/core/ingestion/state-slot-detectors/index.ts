/**
 * State slot detection orchestrator.
 *
 * Runs all registered detectors against file content and returns
 * merged ExtractedStateSlot results.
 */

import type { ExtractedStateSlot } from './types.js';
import { detectReactQuerySlots } from './react-query.js';
import { detectSwrSlots } from './swr.js';
import { detectQueryClientSlots } from './query-client.js';
import { detectReactContextSlots } from './react-context.js';
import { detectReduxSlots } from './redux.js';
import { detectZustandSlots } from './zustand.js';
import { detectCustomHookSlots } from './custom-hook.js';
import { detectGraphQLSlots } from './graphql.js';
import { detectTRPCSlots } from './trpc.js';

export type { ExtractedStateSlot, SlotKind, ShapeConfidence, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
export { CONFIDENCE_MAP } from './types.js';

type Detector = (code: string, filePath: string) => ExtractedStateSlot[];

const DETECTORS: Detector[] = [
  detectReactQuerySlots,
  detectSwrSlots,
  detectQueryClientSlots,
  detectReactContextSlots,
  detectReduxSlots,
  detectZustandSlots,
  detectCustomHookSlots,
  detectGraphQLSlots,
  detectTRPCSlots,
];

const JS_TS_EXTS = /\.(tsx?|jsx?|mjs|cjs)$/;
const GQL_EXTS = /\.(graphql|gql)$/;

/**
 * Run all state slot detectors on a file and return merged results.
 */
export function detectStateSlots(code: string, filePath: string): ExtractedStateSlot[] {
  // Skip non-JS/TS files — detectors target JS/TS-specific patterns
  if (!JS_TS_EXTS.test(filePath) && !GQL_EXTS.test(filePath)) return [];

  const results: ExtractedStateSlot[] = [];
  for (const detector of DETECTORS) {
    results.push(...detector(code, filePath));
  }
  return results;
}
