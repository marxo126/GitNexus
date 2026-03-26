/**
 * Custom hook chain detector.
 *
 * Detects hooks that wrap other hooks and reshape the return value.
 * This works at the source level — not graph-based wrapper resolution.
 *
 * Pattern:
 *   function useFormattedVendors(slug) {
 *     const { data } = useVendorPatterns(slug);
 *     return { items: data?.patterns, count: data?.total };
 *   }
 *
 * Produces a StateSlot with slotKind 'custom-hook', cache key = hook name,
 * and producer keys from the return object literal.
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
import { lineNumberAt, extractObjectKeys, findMatchingBrace } from './utils.js';

/**
 * Extract the return shape keys from a function body.
 * Looks for `return { ... }` and extracts top-level keys.
 */
function extractReturnKeys(funcBody: string): string[] {
  const returnObjPattern = /return\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = returnObjPattern.exec(funcBody)) !== null) {
    const braceStart = funcBody.indexOf('{', match.index + 6);
    if (braceStart === -1) continue;
    const keys = extractObjectKeys(funcBody, braceStart);
    if (keys.length > 0) return keys;
  }

  return [];
}

/**
 * Extract the names of use* hooks called within a function body.
 */
function extractCalledHooks(funcBody: string): string[] {
  const hooks: string[] = [];
  const hookCall = /\buse[A-Z]\w*\s*(?:<[^>]*>\s*)?\(/g;
  let match: RegExpExecArray | null;

  while ((match = hookCall.exec(funcBody)) !== null) {
    const name = match[0].replace(/\s*(?:<[^>]*>\s*)?\($/, '');
    hooks.push(name);
  }

  return [...new Set(hooks)];
}

/**
 * Find functions starting with `use` — both declarations and arrow functions.
 * Returns { name, bodyStart, bodyEnd } for each.
 */
interface HookSpan {
  name: string;
  matchIndex: number;
  bodyStart: number;
  bodyEnd: number;
}

function findHookFunctions(source: string): HookSpan[] {
  const results: HookSpan[] = [];

  // function useXxx(...) { ... }
  const funcDeclPattern = /(?:export\s+)?(?:async\s+)?function\s+(use[A-Z]\w*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+?)?\{/g;
  let match: RegExpExecArray | null;

  while ((match = funcDeclPattern.exec(source)) !== null) {
    const name = match[1];
    const bracePos = source.indexOf('{', match.index + match[0].length - 1);
    if (bracePos === -1) continue;
    const bodyEnd = findMatchingBrace(source, bracePos);
    if (bodyEnd === -1) continue;
    results.push({ name, matchIndex: match.index, bodyStart: bracePos, bodyEnd });
  }

  // const useXxx = (...) => { ... }  or  const useXxx = (...) => ...
  const arrowPattern = /(?:export\s+)?(?:const|let|var)\s+(use[A-Z]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$]\w*)\s*(?::\s*[^=]+?)?\s*=>\s*/g;

  while ((match = arrowPattern.exec(source)) !== null) {
    const name = match[1];
    const arrowEnd = match.index + match[0].length;
    // Check if body starts with `{`
    let bodyIdx = arrowEnd;
    while (bodyIdx < source.length && /\s/.test(source[bodyIdx])) bodyIdx++;

    if (source[bodyIdx] === '{') {
      const bodyEnd = findMatchingBrace(source, bodyIdx);
      if (bodyEnd === -1) continue;
      results.push({ name, matchIndex: match.index, bodyStart: bodyIdx, bodyEnd });
    } else {
      // Expression body — take until next semicolon or newline at depth 0
      const exprEnd = findExpressionEnd(source, bodyIdx);
      results.push({ name, matchIndex: match.index, bodyStart: bodyIdx, bodyEnd: exprEnd });
    }
  }

  return results;
}

function findExpressionEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth--;
    } else if (ch === ';' && depth === 0) return i;
    else if (ch === '\n' && depth === 0 && i > start + 5) return i;
  }
  return source.length;
}

/**
 * Detect custom hook chains in a source file.
 *
 * A custom hook chain is a function starting with `use` that:
 * 1. Calls at least one other `use*` hook
 * 2. Returns an object literal (reshaping the data)
 *
 * @param source  Raw source text of the file
 * @param filePath  Absolute path to the file
 * @returns Array of ExtractedStateSlot records
 */
export function detectCustomHookSlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];
  const hookFunctions = findHookFunctions(source);

  for (const hook of hookFunctions) {
    const body = source.slice(hook.bodyStart, hook.bodyEnd + 1);

    // Must call at least one other use* hook
    const calledHooks = extractCalledHooks(body);
    // Filter out calls to itself
    const otherHooks = calledHooks.filter(h => h !== hook.name);
    if (otherHooks.length === 0) continue;

    // Must return an object literal
    const returnKeys = extractReturnKeys(body);
    if (returnKeys.length === 0) continue;

    const lineNumber = lineNumberAt(source, hook.matchIndex);

    const producer: ExtractedStateSlotProducer = {
      functionName: hook.name,
      filePath,
      lineNumber,
      keys: returnKeys,
      confidence: 'ast-literal',
    };

    const slot: ExtractedStateSlot = {
      name: hook.name,
      slotKind: 'custom-hook',
      cacheKey: hook.name,
      filePath,
      lineNumber,
      producers: [producer],
      consumers: [],
    };

    slots.push(slot);
  }

  return slots;
}
