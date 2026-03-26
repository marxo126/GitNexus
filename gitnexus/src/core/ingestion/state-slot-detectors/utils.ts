/**
 * Shared utilities for state slot detectors.
 *
 * Extracted from individual detector files to eliminate duplication.
 */

/**
 * Get 1-based line number for a character position using a counting loop.
 */
export function lineNumberAt(source: string, pos: number): number {
  let count = 1;
  for (let i = 0; i < pos && i < source.length; i++) {
    if (source[i] === '\n') count++;
  }
  return count;
}

/**
 * Find the name of the enclosing function for a given position in source.
 *
 * Collects all matches from function declarations, arrow functions, and method
 * definitions, sorts by descending index, and picks the closest one.
 * Includes a keyword blocklist to avoid false matches on control-flow keywords.
 */
export function findEnclosingFunctionName(source: string, pos: number): string {
  const before = source.slice(0, pos);

  // Match function declarations: function Foo(, async function Foo(
  const funcDecl = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  // Match arrow functions assigned to variables: const foo = (...) =>
  const arrowFunc = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/g;
  // Match method definitions: foo(, async foo(
  const methodDef = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;

  const KEYWORD_BLOCKLIST = ['if', 'for', 'while', 'switch', 'catch', 'return'];

  const allMatches: Array<{ name: string; index: number }> = [];

  for (const pattern of [funcDecl, arrowFunc, methodDef]) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(before)) !== null) {
      const name = m[1];
      if (!KEYWORD_BLOCKLIST.includes(name)) {
        allMatches.push({ name, index: m.index });
      }
    }
  }

  // Sort by descending index — pick the closest enclosing declaration
  allMatches.sort((a, b) => b.index - a.index);
  return allMatches[0]?.name ?? '<anonymous>';
}

/**
 * Extract top-level keys from an object literal starting at braceStart.
 * Handles `{ key1: val1, key2: val2 }` and shorthand `{ key1, key2 }`.
 * Uses brace-depth counting to skip nested objects.
 */
export function extractObjectKeys(source: string, braceStart: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let segmentStart = braceStart + 1;

  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      if (depth === 1) segmentStart = i + 1;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const segment = source.slice(segmentStart, i).trim();
        if (segment && /^\w+$/.test(segment)) keys.push(segment);
        break;
      }
    } else if (depth === 1 && ch === ':') {
      const before = source.slice(segmentStart, i).trim();
      const keyMatch = before.match(/(?:['"]([^'"]+)['"]|(\w+))\s*$/);
      if (keyMatch) keys.push(keyMatch[1] || keyMatch[2]);
    } else if (depth === 1 && ch === ',') {
      const segment = source.slice(segmentStart, i).trim();
      if (segment && /^\w+$/.test(segment)) keys.push(segment);
      segmentStart = i + 1;
    }
  }

  return [...new Set(keys)];
}

/**
 * Extract text between balanced delimiters starting at openPos.
 * Returns the text inside the delimiters (exclusive of outer delimiters),
 * or null if no matching close is found.
 */
export function extractBalanced(source: string, openPos: number, openChar: string, closeChar: string): string | null {
  let depth = 0;
  for (let i = openPos; i < source.length; i++) {
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) {
      depth--;
      if (depth === 0) return source.slice(openPos + 1, i);
    }
  }
  return null;
}

/**
 * Find the position of the matching closing brace for an opening `{` at openPos.
 * Returns the index of the `}`, or -1 if not found.
 * Shorthand for extractBalanced with `{`/`}` that returns an index instead of text.
 */
export function findMatchingBrace(source: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
