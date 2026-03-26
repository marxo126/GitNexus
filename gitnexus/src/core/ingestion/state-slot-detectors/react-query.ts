/**
 * React Query state slot detector.
 *
 * Detects useQuery, useMutation, useInfiniteQuery, useSuspenseQuery calls
 * and extracts cache key, enclosing function name, and consumer access patterns.
 */

import type { ExtractedStateSlot, ExtractedStateSlotConsumer, ExtractedStateSlotProducer } from './types.js';
import { extractDestructuredKeys, extractPropertyAccessKeys } from '../shape-inference.js';
import { lineNumberAt, findEnclosingFunctionName } from './utils.js';

/** The React Query hook names this detector handles */
const REACT_QUERY_HOOKS = ['useQuery', 'useMutation', 'useInfiniteQuery', 'useSuspenseQuery'] as const;
type ReactQueryHook = typeof REACT_QUERY_HOOKS[number];

/** The option key used to identify cache key per hook type */
const CACHE_KEY_OPTION: Record<ReactQueryHook, string> = {
  useQuery: 'queryKey',
  useMutation: 'mutationKey',
  useInfiniteQuery: 'queryKey',
  useSuspenseQuery: 'queryKey',
};

/**
 * Extract the cache key array literal from the options object text.
 * Matches `queryKey: [...]` or `mutationKey: [...]` patterns.
 * Uses bracket-depth counting to capture the full array.
 */
function extractCacheKey(optionsText: string, keyName: string): string | null {
  const keyPattern = new RegExp(`${keyName}\\s*:\\s*\\[`);
  const match = keyPattern.exec(optionsText);
  if (!match) return null;

  const bracketStart = optionsText.indexOf('[', match.index);
  if (bracketStart === -1) return null;

  let depth = 0;
  for (let i = bracketStart; i < optionsText.length; i++) {
    const ch = optionsText[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return optionsText.slice(bracketStart, i + 1);
      }
    }
  }
  return null;
}


/**
 * Extract the options object text for a React Query hook call.
 * Starting from the opening `(` of the call, finds the matching `)`.
 * Returns the text inside the parentheses.
 */
function extractCallOptions(source: string, openParenPos: number): string | null {
  let depth = 0;
  for (let i = openParenPos; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return source.slice(openParenPos + 1, i);
      }
    }
  }
  return null;
}

/**
 * Detect React Query slots in a source file.
 *
 * For each useQuery / useMutation / useInfiniteQuery / useSuspenseQuery call:
 * - Extracts queryKey or mutationKey as the cache key
 * - Finds the enclosing function name (producer + consumer function name)
 * - Extracts consumer accessed keys from destructuring and property access
 *   in the surrounding function body
 *
 * @param source  Raw source text of the file
 * @param filePath  Absolute path to the file (used for slot metadata)
 * @returns Array of ExtractedStateSlot records
 */
export function detectReactQuerySlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  for (const hook of REACT_QUERY_HOOKS) {
    const hookPattern = new RegExp(`\\b${hook}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;

    while ((match = hookPattern.exec(source)) !== null) {
      const callStart = match.index;
      const openParenPos = callStart + match[0].length - 1; // position of '('

      const optionsText = extractCallOptions(source, openParenPos);
      if (!optionsText) continue;

      const keyName = CACHE_KEY_OPTION[hook];
      const cacheKey = extractCacheKey(optionsText, keyName);
      if (!cacheKey) continue;

      const lineNumber = lineNumberAt(source, callStart);
      const enclosingFn = findEnclosingFunctionName(source, callStart);

      // Determine the surrounding function body for consumer key extraction.
      // Use a 1500-char window after the hook call as an approximation.
      const windowEnd = Math.min(source.length, callStart + 1500);
      const surroundingBody = source.slice(callStart, windowEnd);

      const destructuredKeys = extractDestructuredKeys(surroundingBody);
      const propertyKeys = extractPropertyAccessKeys(surroundingBody);
      const accessedKeys = [...new Set([...destructuredKeys, ...propertyKeys])];

      const producer: ExtractedStateSlotProducer = {
        functionName: enclosingFn,
        filePath,
        lineNumber,
        keys: [],
        confidence: 'heuristic',
      };

      const consumer: ExtractedStateSlotConsumer = {
        functionName: enclosingFn,
        filePath,
        lineNumber,
        accessedKeys,
        confidence: 'heuristic',
      };

      const slot: ExtractedStateSlot = {
        name: cacheKey,
        slotKind: 'react-query',
        cacheKey,
        filePath,
        lineNumber,
        producers: [producer],
        consumers: accessedKeys.length > 0 ? [consumer] : [],
      };

      slots.push(slot);
    }
  }

  return slots;
}
