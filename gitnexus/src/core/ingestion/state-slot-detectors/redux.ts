/**
 * Redux createSlice state slot detector.
 *
 * Detects createSlice() calls with name and initialState, and useSelector()
 * calls to extract state access patterns.
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
import { extractPropertyAccessKeys } from '../shape-inference.js';
import { lineNumberAt, findEnclosingFunctionName, extractObjectKeys, extractBalanced } from './utils.js';

/**
 * Extract the value of a named property from an object literal text.
 * For `name: 'auth'` returns `'auth'`. For `initialState: { ... }` returns `{ ... }`.
 */
function extractPropertyValue(objText: string, propName: string): string | null {
  const pattern = new RegExp(`\\b${propName}\\s*:\\s*`);
  const match = pattern.exec(objText);
  if (!match) return null;

  const valueStart = match.index + match[0].length;
  let i = valueStart;

  // Skip whitespace
  while (i < objText.length && /\s/.test(objText[i])) i++;

  if (i >= objText.length) return null;

  const ch = objText[i];

  // String literal
  if (ch === "'" || ch === '"') {
    const closeIdx = objText.indexOf(ch, i + 1);
    if (closeIdx === -1) return null;
    return objText.slice(i, closeIdx + 1);
  }

  // Object or array literal
  if (ch === '{' || ch === '[') {
    const close = ch === '{' ? '}' : ']';
    const balanced = extractBalanced(objText, i, ch, close);
    if (!balanced) return null;
    return ch + balanced + close;
  }

  // Simple value: read until comma or closing brace at depth 0
  let depth = 0;
  const start = i;
  for (; i < objText.length; i++) {
    const c = objText[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  return objText.slice(start, i).trim();
}

/**
 * Detect Redux state slots in a source file.
 *
 * Patterns detected:
 * - `createSlice({ name: '...', initialState: { ... } })` — producer with shape
 * - `useSelector((state) => state.sliceName.key)` — consumer with accessed keys
 */
export function detectReduxSlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  // ── Detect createSlice() calls ────────────────────────────────────────
  const createSlicePattern = /\bcreateSlice\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = createSlicePattern.exec(source)) !== null) {
    const callStart = match.index;
    const parenPos = source.indexOf('(', callStart);
    if (parenPos === -1) continue;

    const argText = extractBalanced(source, parenPos, '(', ')');
    if (!argText) continue;

    // Extract slice name
    const nameValue = extractPropertyValue(argText, 'name');
    if (!nameValue) continue;
    const sliceName = nameValue.replace(/['"]/g, '');

    // Extract initialState keys
    const initialStateText = extractPropertyValue(argText, 'initialState');
    const braceIdx = initialStateText ? initialStateText.indexOf('{') : -1;
    const keys = braceIdx !== -1 ? extractObjectKeys(initialStateText!, braceIdx) : [];

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
      name: sliceName,
      slotKind: 'redux',
      cacheKey: sliceName,
      filePath,
      lineNumber,
      producers: [producer],
      consumers: [],
    };

    slots.push(slot);
  }

  // ── Detect useSelector() calls ────────────────────────────────────────
  const useSelectorPattern = /\buseSelector\s*\(\s*\(?(\w+)\)?\s*=>/g;

  while ((match = useSelectorPattern.exec(source)) !== null) {
    const callStart = match.index;
    const stateParam = match[1]; // e.g. 'state'
    const lineNumber = lineNumberAt(source, callStart);
    const enclosingFn = findEnclosingFunctionName(source, callStart);

    // Extract the selector body to find accessed keys
    // Look for state.sliceName.key or state.sliceName patterns
    const windowEnd = Math.min(source.length, callStart + 500);
    const selectorBody = source.slice(callStart, windowEnd);

    // Match state.sliceName.key — capture sliceName and key
    const accessPattern = new RegExp(
      `\\b${stateParam}\\.([a-zA-Z_]\\w*)\\.([a-zA-Z_]\\w*)`,
      'g',
    );

    const accessedBySlice = new Map<string, string[]>();
    let accessMatch: RegExpExecArray | null;

    while ((accessMatch = accessPattern.exec(selectorBody)) !== null) {
      const sliceName = accessMatch[1];
      const key = accessMatch[2];
      let keys = accessedBySlice.get(sliceName);
      if (!keys) { keys = []; accessedBySlice.set(sliceName, keys); }
      if (!keys.includes(key)) keys.push(key);
    }

    // For simple state.sliceName accesses (no sub-key), record without specific keys.
    // Use a word boundary after the slice name to avoid backtracking into partial matches.
    if (accessedBySlice.size === 0) {
      const simplePattern = new RegExp(
        `\\b${stateParam}\\.([a-zA-Z_]\\w*)\\b`,
        'g',
      );
      while ((accessMatch = simplePattern.exec(selectorBody)) !== null) {
        const sliceName = accessMatch[1];
        // Only add if not already captured by the detailed pattern
        if (!accessedBySlice.has(sliceName)) {
          accessedBySlice.set(sliceName, []);
        }
      }
    }

    for (const [sliceName, accessedKeys] of accessedBySlice) {
      // Check if there's already a slot for this slice
      const existingSlot = slots.find(s => s.cacheKey === sliceName);
      if (existingSlot) {
        // Check if there's already a consumer from the same function — merge keys
        const existingConsumer = existingSlot.consumers.find(c => c.functionName === enclosingFn && c.filePath === filePath);
        if (existingConsumer) {
          for (const key of accessedKeys) {
            if (!existingConsumer.accessedKeys.includes(key)) {
              existingConsumer.accessedKeys.push(key);
            }
          }
        } else {
          existingSlot.consumers.push({
            functionName: enclosingFn,
            filePath,
            lineNumber,
            accessedKeys,
            confidence: 'heuristic',
          });
        }
      } else {
        const consumer: ExtractedStateSlotConsumer = {
          functionName: enclosingFn,
          filePath,
          lineNumber,
          accessedKeys,
          confidence: 'heuristic',
        };
        const slot: ExtractedStateSlot = {
          name: sliceName,
          slotKind: 'redux',
          cacheKey: sliceName,
          filePath,
          lineNumber,
          producers: [],
          consumers: [consumer],
        };
        slots.push(slot);
      }
    }
  }

  return slots;
}
