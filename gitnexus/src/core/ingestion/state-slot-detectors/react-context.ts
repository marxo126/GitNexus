/**
 * React Context state slot detector.
 *
 * Detects createContext() calls, Provider value props, and useContext() calls
 * to extract state slot shapes and consumer access patterns.
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
import { extractDestructuredKeys, extractPropertyAccessKeys } from '../shape-inference.js';
import { lineNumberAt, findEnclosingFunctionName, extractObjectKeys, extractBalanced } from './utils.js';

/**
 * Detect React Context state slots in a source file.
 *
 * Patterns detected:
 * - `createContext(defaultValue)` — shape from default value object literal
 * - `useContext(ContextName)` — consumer with property access tracking
 */
export function detectReactContextSlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  // ── Detect createContext() calls ──────────────────────────────────────
  const createCtxPattern = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:React\.)?createContext\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = createCtxPattern.exec(source)) !== null) {
    const contextName = match[1];
    const callStart = match.index;
    const parenPos = source.indexOf('(', callStart + match[0].length - 1);
    if (parenPos === -1) continue;

    const argText = extractBalanced(source, parenPos, '(', ')');
    if (!argText) continue;

    const trimmedArg = argText.trim();
    const lineNumber = lineNumberAt(source, callStart);

    // Extract shape from default value if it's an object literal
    const braceIdx = trimmedArg.indexOf('{');
    const keys = braceIdx !== -1 ? extractObjectKeys(trimmedArg, braceIdx) : [];

    const producer: ExtractedStateSlotProducer = {
      functionName: findEnclosingFunctionName(source, callStart),
      filePath,
      lineNumber,
      keys,
      confidence: keys.length > 0 ? 'ast-literal' : 'heuristic',
    };

    const slot: ExtractedStateSlot = {
      name: contextName,
      slotKind: 'react-context',
      cacheKey: contextName,
      filePath,
      lineNumber,
      producers: [producer],
      consumers: [],
    };

    slots.push(slot);
  }

  // ── Detect useContext() calls ──────────────────────────────────────────
  const useCtxPattern = /\buseContext\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

  while ((match = useCtxPattern.exec(source)) !== null) {
    const contextName = match[1];
    const callStart = match.index;
    const lineNumber = lineNumberAt(source, callStart);
    const enclosingFn = findEnclosingFunctionName(source, callStart);

    // Look for destructured keys and property access in surrounding context
    // Start window before the useContext call to capture `const { ... } = useContext(...)`
    const windowStart = Math.max(0, callStart - 200);
    const windowEnd = Math.min(source.length, callStart + 1500);
    const surroundingBody = source.slice(windowStart, windowEnd);
    const destructuredKeys = extractDestructuredKeys(surroundingBody);
    const propertyKeys = extractPropertyAccessKeys(surroundingBody);
    const accessedKeys = [...new Set([...destructuredKeys, ...propertyKeys])];

    const consumer: ExtractedStateSlotConsumer = {
      functionName: enclosingFn,
      filePath,
      lineNumber,
      accessedKeys,
      confidence: 'heuristic',
    };

    // Check if there's already a slot for this context (from createContext)
    const existingSlot = slots.find(s => s.cacheKey === contextName);
    if (existingSlot) {
      existingSlot.consumers.push(consumer);
    } else {
      // Create a consumer-only slot for contexts defined in another file
      const slot: ExtractedStateSlot = {
        name: contextName,
        slotKind: 'react-context',
        cacheKey: contextName,
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
