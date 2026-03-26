/**
 * JSX Element Extractor — character-walking parser for JSX elements and their attributes.
 *
 * Uses a character-by-character parser instead of regex or tree-sitter because:
 * 1. Regex patterns using [^>] fail on multi-line JSX attributes (the root cause
 *    of 81% false positives in the WCAG a11y detector).
 * 2. Tree-sitter captures JSX elements and attributes as separate matches,
 *    making parent-child correlation unreliable across pattern boundaries.
 * 3. The char-walker correctly handles `>` inside JSX expressions and strings,
 *    multi-line attributes, and nested braces.
 */

import type { ExtractedJSXElement } from './types.js';

// ─── Regex patterns ────────────────────────────────────────────────────

/**
 * Matches closing JSX tags: </Tag>
 * Group 1: tag name
 */
const CLOSING_TAG_RE = /<\/([A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)\s*>/g;

/**
 * Matches individual JSX attributes.
 * Handles: name="value", name='value', name={expr}, name (boolean)
 * Group 1: attribute name
 * Group 2: quoted value (double quotes)
 * Group 3: quoted value (single quotes)
 * Group 4: expression value (inside braces — first level only)
 */
const ATTR_RE = /([a-zA-Z_][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;

// ─── Character-walking tag parser ─────────────────────────────────────

interface RawTagMatch {
  tag: string;
  attrs: string;
  selfClosing: boolean;
  offset: number;
  endOffset: number;
}

/**
 * Parse JSX opening/self-closing tags using character-by-character walking.
 *
 * Unlike regex, this correctly handles:
 * - Multi-line attributes (the root cause of 81% false positives)
 * - `>` inside JSX expressions (e.g. `onClick={() => val > 0}`)
 * - `>` inside string literals
 * - Nested braces in expressions
 */
function extractRawTags(source: string): RawTagMatch[] {
  const tags: RawTagMatch[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Find next <
    if (source[i] !== '<') { i++; continue; }

    // Skip closing tags </...>
    if (i + 1 < len && source[i + 1] === '/') { i += 2; continue; }

    // Skip comments <!-- ... -->, doctype <!...>, and processing instructions <?...>
    if (i + 1 < len && (source[i + 1] === '!' || source[i + 1] === '?')) { i += 2; continue; }

    // Try to read a tag name
    const tagStart = i;
    i++; // skip <
    const nameStart = i;
    while (i < len && /[A-Za-z0-9.]/.test(source[i])) i++;
    const tagName = source.slice(nameStart, i);

    // Must be a valid JSX tag name: starts with uppercase (component) or lowercase letter
    if (!tagName || !/^[A-Za-z]/.test(tagName)) continue;
    // Lowercase tags must match HTML element pattern (letters and hyphens only after first char)
    if (/^[a-z]/.test(tagName) && !/^[a-z][a-z0-9-]*$/.test(tagName)) continue;

    // Read attributes until > or />
    // Must handle: string literals ("..." or '...'), JSX expressions ({...}), template literals (`...`)
    const attrStart = i;
    let depth = 0; // brace depth for JSX expressions
    let inString: string | null = null;
    let found = false;

    while (i < len) {
      const ch = source[i];

      if (inString) {
        if (ch === '\\') { i += 2; continue; } // skip escaped chars
        if (ch === inString) inString = null;
        i++; continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i++; continue; }
      if (ch === '{') { depth++; i++; continue; }
      if (ch === '}') { depth--; i++; continue; }

      if (depth === 0) {
        if (ch === '/' && i + 1 < len && source[i + 1] === '>') {
          // Self-closing tag
          const attrStr = source.slice(attrStart, i);
          tags.push({ tag: tagName, attrs: attrStr, selfClosing: true, offset: tagStart, endOffset: i + 2 });
          i += 2;
          found = true;
          break;
        }
        if (ch === '>') {
          // Opening tag
          const attrStr = source.slice(attrStart, i);
          tags.push({ tag: tagName, attrs: attrStr, selfClosing: false, offset: tagStart, endOffset: i + 1 });
          i++;
          found = true;
          break;
        }
      }
      i++;
    }

    // If we never found a closing > or />, just move on (malformed tag)
    if (!found && i >= len) break;
  }

  return tags;
}

/**
 * Matches function/arrow function declarations to determine enclosing function.
 * Group 1: function name (function declaration)
 * Group 2: const/let/var name (arrow function)
 */
const FUNCTION_RE = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*function)/g;

// ─── Helpers ───────────────────────────────────────────────────────────

interface RawJSXMatch {
  tag: string;
  attrString: string;
  line: number;
  offset: number;
  endOffset: number;
  selfClosing: boolean;
}

function parseAttributes(attrString: string): Map<string, string | true> {
  const attrs = new Map<string, string | true>();
  if (!attrString) return attrs;

  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? true;
    attrs.set(name, value);
  }
  return attrs;
}

function extractClassNames(attrs: Map<string, string | true>): string[] | undefined {
  const cls = attrs.get('className') ?? attrs.get('class');
  if (!cls || cls === true) return undefined;
  return String(cls).split(/\s+/).filter(Boolean);
}

/**
 * Precompute newline offsets for O(log n) line lookups via binary search.
 */
function buildNewlineOffsets(source: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') offsets.push(i);
  }
  return offsets;
}

function lineNumberAt(newlineOffsets: number[], offset: number): number {
  // Binary search: find how many newlines occur before `offset`
  let lo = 0;
  let hi = newlineOffsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (newlineOffsets[mid] < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/**
 * Find the enclosing function name for a given offset in the source.
 * Walks backwards through function declarations to find the nearest one
 * whose body contains the offset.
 */
function findEnclosingFunction(source: string, offset: number): string {
  FUNCTION_RE.lastIndex = 0;
  let lastFunc = '<module>';
  let m: RegExpExecArray | null;
  while ((m = FUNCTION_RE.exec(source)) !== null) {
    if (m.index > offset) break;
    const name = m[1] || m[2] || m[3];
    if (name) lastFunc = name;
  }
  return lastFunc;
}

// ─── Main extraction ───────────────────────────────────────────────────

/**
 * Extract JSX elements from source code.
 *
 * @param source - The full file source text
 * @param filePath - File path for the extracted elements
 * @returns Array of extracted JSX elements
 */
export function extractJSXElements(source: string, filePath: string): ExtractedJSXElement[] {
  const elements: ExtractedJSXElement[] = [];

  // Skip files that clearly have no JSX
  if (!source.includes('<')) return elements;

  // Perf 1: Precompute newline offsets for O(log n) line lookups
  const newlineOffsets = buildNewlineOffsets(source);

  // Collect all opening and self-closing tags using character-walking parser
  const rawTags = extractRawTags(source);
  const rawMatches: RawJSXMatch[] = [];

  for (const raw of rawTags) {
    // Skip script/style tags
    if (raw.tag === 'script' || raw.tag === 'style') continue;

    rawMatches.push({
      tag: raw.tag,
      attrString: raw.attrs,
      line: lineNumberAt(newlineOffsets, raw.offset),
      offset: raw.offset,
      endOffset: raw.endOffset,
      selfClosing: raw.selfClosing,
    });
  }

  // Build closing tag positions for hasChildren/textContent detection
  const closingTags: Array<{ tag: string; offset: number; endOffset: number }> = [];
  CLOSING_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLOSING_TAG_RE.exec(source)) !== null) {
    closingTags.push({ tag: m[1], offset: m.index, endOffset: m.index + m[0].length });
  }

  // Perf 2: Pre-build a map of closing tags by tag name for faster lookup
  const closingTagsByName = new Map<string, Array<{ offset: number; endOffset: number; index: number }>>();
  for (let i = 0; i < closingTags.length; i++) {
    const ct = closingTags[i];
    let arr = closingTagsByName.get(ct.tag);
    if (!arr) {
      arr = [];
      closingTagsByName.set(ct.tag, arr);
    }
    arr.push({ offset: ct.offset, endOffset: ct.endOffset, index: i });
  }

  // Bug 8: Track consumed closing tags to prevent double-matching nested same-tag elements
  const consumedClosingTags = new Set<number>();

  for (let rawIdx = 0; rawIdx < rawMatches.length; rawIdx++) {
    const raw = rawMatches[rawIdx];
    const attributes = parseAttributes(raw.attrString);
    const classNames = extractClassNames(attributes);
    const enclosingFunction = findEnclosingFunction(source, raw.offset);

    let hasChildren = false;
    let textContent: string | undefined;

    if (!raw.selfClosing) {
      // Find the matching closing tag (first unconsumed one after this element)
      const candidates = closingTagsByName.get(raw.tag);
      let closing: { offset: number; endOffset: number; index: number } | undefined;
      if (candidates) {
        for (const c of candidates) {
          if (c.offset > raw.endOffset && !consumedClosingTags.has(c.index)) {
            closing = c;
            break;
          }
        }
      }
      if (closing) {
        consumedClosingTags.add(closing.index);
        const between = source.slice(raw.endOffset, closing.offset).trim();
        hasChildren = between.length > 0;
        // Extract text content (only if it's plain text, not nested JSX)
        if (between.length > 0 && !between.includes('<')) {
          // Strip expression wrappers like {"text"} or {variable}
          textContent = between.replace(/^\{["']?|["']?\}$/g, '').trim() || undefined;
        }
      }
    }

    // Find parent tag: the nearest opening tag that encloses this element
    // Perf 2: Use rawIdx instead of indexOf(raw)
    let parentTag: string | undefined;
    for (let i = rawIdx - 1; i >= 0; i--) {
      const candidate = rawMatches[i];
      if (!candidate.selfClosing) {
        // Check if an unconsumed closing tag for this candidate exists after our element
        const candidateCandidates = closingTagsByName.get(candidate.tag);
        if (candidateCandidates) {
          const hasEnclosing = candidateCandidates.some(
            (c) => c.offset > raw.endOffset && !consumedClosingTags.has(c.index),
          );
          if (hasEnclosing) {
            parentTag = candidate.tag;
            break;
          }
        }
      }
    }

    elements.push({
      tag: raw.tag,
      filePath,
      lineNumber: raw.line,
      attributes,
      hasChildren,
      textContent,
      enclosingFunction,
      parentTag,
      ...(classNames ? { classNames } : {}),
    });
  }

  return elements;
}
