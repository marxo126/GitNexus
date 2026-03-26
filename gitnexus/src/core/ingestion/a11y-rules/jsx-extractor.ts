/**
 * JSX Element Extractor — regex-based extraction of JSX elements and their attributes.
 *
 * Uses regex instead of tree-sitter queries because:
 * 1. Tree-sitter captures JSX elements and attributes as separate matches,
 *    making parent-child correlation unreliable across pattern boundaries.
 * 2. JSX attribute values can be string literals OR expressions (`{...}`),
 *    which are hard to capture correctly in S-expression queries.
 * 3. Regex on source text is simpler, deterministic, and mirrors the approach
 *    used by state-slot detectors elsewhere in the codebase.
 */

import type { ExtractedJSXElement } from './types.js';

// ─── Regex patterns ────────────────────────────────────────────────────

/**
 * Matches self-closing JSX elements: <Tag attr="val" />
 * Group 1: tag name
 * Group 2: attributes string (everything between tag name and />)
 */
const SELF_CLOSING_RE = /<([A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)\s*((?:[^>](?!(?:\/\s*>)))*[^>]?)?\s*\/>/g;

/**
 * Matches opening JSX elements: <Tag attr="val">
 * Group 1: tag name
 * Group 2: attributes string
 */
const OPENING_TAG_RE = /<([A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)\s*((?:[^>])*?)?\s*>/g;

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

function lineNumberAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
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

  // Collect all opening and self-closing tags
  const rawMatches: RawJSXMatch[] = [];

  // Self-closing elements
  SELF_CLOSING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SELF_CLOSING_RE.exec(source)) !== null) {
    rawMatches.push({
      tag: m[1],
      attrString: m[2] || '',
      line: lineNumberAt(source, m.index),
      offset: m.index,
      endOffset: m.index + m[0].length,
      selfClosing: true,
    });
  }

  // Opening elements (non-self-closing)
  OPENING_TAG_RE.lastIndex = 0;
  while ((m = OPENING_TAG_RE.exec(source)) !== null) {
    const tag = m[1];
    // Skip HTML comments, script/style in non-JSX, or if this is actually a self-closing match
    // Also skip tags that are likely just less-than operators
    if (tag === 'script' || tag === 'style') continue;

    // Check this isn't a self-closing tag (already handled above)
    const fullMatch = m[0];
    if (fullMatch.endsWith('/>')) continue;

    rawMatches.push({
      tag,
      attrString: m[2] || '',
      line: lineNumberAt(source, m.index),
      offset: m.index,
      endOffset: m.index + m[0].length,
      selfClosing: false,
    });
  }

  // Sort by offset for proper processing
  rawMatches.sort((a, b) => a.offset - b.offset);

  // Build closing tag positions for hasChildren/textContent detection
  const closingTags: Array<{ tag: string; offset: number; endOffset: number }> = [];
  CLOSING_TAG_RE.lastIndex = 0;
  while ((m = CLOSING_TAG_RE.exec(source)) !== null) {
    closingTags.push({ tag: m[1], offset: m.index, endOffset: m.index + m[0].length });
  }

  for (const raw of rawMatches) {
    const attributes = parseAttributes(raw.attrString);
    const classNames = extractClassNames(attributes);
    const enclosingFunction = findEnclosingFunction(source, raw.offset);

    let hasChildren = false;
    let textContent: string | undefined;

    if (!raw.selfClosing) {
      // Find the matching closing tag
      const closing = closingTags.find(
        (c) => c.tag === raw.tag && c.offset > raw.endOffset,
      );
      if (closing) {
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
    let parentTag: string | undefined;
    for (let i = rawMatches.indexOf(raw) - 1; i >= 0; i--) {
      const candidate = rawMatches[i];
      if (!candidate.selfClosing) {
        // Check if a closing tag for this candidate exists after our element
        const candidateClosing = closingTags.find(
          (c) => c.tag === candidate.tag && c.offset > raw.endOffset,
        );
        if (candidateClosing) {
          parentTag = candidate.tag;
          break;
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
