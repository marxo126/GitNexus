/**
 * Zustand store state slot detector.
 *
 * Detects `create()` store definitions and `useStore()` selector calls
 * to extract state shapes and consumer access patterns.
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
import { extractPropertyAccessKeys } from '../shape-inference.js';
import { lineNumberAt, findEnclosingFunctionName, extractBalanced, extractObjectKeys } from './utils.js';

/**
 * Extract top-level keys from an object literal that is the return value
 * of a factory function. Looks for `({ key: ..., key: ... })` patterns.
 */
function extractFactoryReturnKeys(factoryBody: string): string[] {
  const keys: string[] = [];

  // The factory typically returns an object literal: (set, get) => ({ key1: val, key2: val })
  // Or: (set) => ({ key1: val, key2: val })
  // Find the opening `({` pattern
  const returnPattern = /=>\s*\(\s*\{/;
  const returnMatch = returnPattern.exec(factoryBody);
  if (!returnMatch) {
    // Also try: => { return { ... } }
    const blockReturn = /return\s+\{/;
    const blockMatch = blockReturn.exec(factoryBody);
    if (!blockMatch) return keys;

    const bracePos = factoryBody.indexOf('{', blockMatch.index + 7);
    if (bracePos === -1) return keys;
    return extractObjectKeys(factoryBody, bracePos);
  }

  const bracePos = factoryBody.indexOf('{', returnMatch.index + returnMatch[0].length - 1);
  if (bracePos === -1) return keys;

  return extractObjectKeys(factoryBody, bracePos);
}

/**
 * Detect Zustand state slots in a source file.
 *
 * Patterns detected:
 * - `create((set, get) => ({ count: 0, ... }))` or `create<State>()((set) => ...)` — producer
 * - `useStore((state) => state.count)` — consumer with accessed key
 */
export function detectZustandSlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  // ── Detect create() store definitions ─────────────────────────────────
  // Match: const useStore = create(...) or const useStore = create<Type>()(...)
  const createPattern = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:zustand\.)?create\s*(?:<[^>]*>)?\s*\((?:\s*\)?\s*\()?/g;
  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(source)) !== null) {
    const storeName = match[1];
    const callStart = match.index;

    // Find the outermost opening paren of the create call
    const firstParenPos = source.indexOf('(', callStart + match[0].indexOf('create'));
    if (firstParenPos === -1) continue;

    const argText = extractBalanced(source, firstParenPos, '(', ')');
    if (!argText) continue;

    // The argument may itself be a curried call: create<T>()(factory)
    // In that case, argText might be empty or just types, and the real factory is in the next ()
    let factoryText = argText;
    if (argText.trim() === '' || /^\s*\)\s*\(/.test(argText)) {
      // Curried: create<T>()(factory) — find the second paren pair
      const secondParenPos = source.indexOf('(', firstParenPos + argText.length + 2);
      if (secondParenPos !== -1) {
        const secondArg = extractBalanced(source, secondParenPos, '(', ')');
        if (secondArg) factoryText = secondArg;
      }
    }

    const keys = extractFactoryReturnKeys(factoryText);
    const lineNumber = lineNumberAt(source, callStart);
    const enclosingFn = findEnclosingFunctionName(source, callStart);

    const producer: ExtractedStateSlotProducer = {
      functionName: enclosingFn,
      filePath,
      lineNumber,
      keys,
      confidence: keys.length > 0 ? 'ast-literal' : 'heuristic',
    };

    const slot: ExtractedStateSlot = {
      name: storeName,
      slotKind: 'zustand',
      cacheKey: storeName,
      filePath,
      lineNumber,
      producers: [producer],
      consumers: [],
    };

    slots.push(slot);
  }

  // ── Detect useStore() selector calls ──────────────────────────────────
  // Match: useStore((state) => state.key) or useXxxStore(s => s.key)
  // Also match named store hooks: useSomeStore((state) => ...)
  const useSelectorPattern = /\b(use\w*Store)\s*\(\s*\(?(\w+)\)?\s*=>/g;

  while ((match = useSelectorPattern.exec(source)) !== null) {
    const hookName = match[1];
    const stateParam = match[2];
    const callStart = match.index;
    const lineNumber = lineNumberAt(source, callStart);
    const enclosingFn = findEnclosingFunctionName(source, callStart);

    // Extract accessed keys from selector body
    const windowEnd = Math.min(source.length, callStart + 300);
    const selectorBody = source.slice(callStart, windowEnd);

    // Match state.key patterns
    const accessPattern = new RegExp(
      `\\b${stateParam}\\.([a-zA-Z_]\\w*)`,
      'g',
    );

    const accessedKeys: string[] = [];
    let accessMatch: RegExpExecArray | null;
    while ((accessMatch = accessPattern.exec(selectorBody)) !== null) {
      const key = accessMatch[1];
      if (!accessedKeys.includes(key)) accessedKeys.push(key);
    }

    if (accessedKeys.length === 0) continue;

    const consumer: ExtractedStateSlotConsumer = {
      functionName: enclosingFn,
      filePath,
      lineNumber,
      accessedKeys,
      confidence: 'heuristic',
    };

    // Try to find the matching store slot by hook name
    // Convention: useStore or useSomeStore -> store name is the const variable
    const existingSlot = slots.find(s => s.cacheKey === hookName);
    if (existingSlot) {
      existingSlot.consumers.push(consumer);
    } else {
      const slot: ExtractedStateSlot = {
        name: hookName,
        slotKind: 'zustand',
        cacheKey: hookName,
        filePath,
        lineNumber,
        producers: [],
        consumers: [consumer],
      };
      slots.push(slot);
    }
  }

  return slots;
}
