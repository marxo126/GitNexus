/**
 * Shared helpers for WCAG a11y rules.
 *
 * Extracted to avoid copy-paste duplication across rule files.
 */

import type { WCAGRule, ExtractedJSXElement, A11ySignal } from './types.js';

/** Check if an element has any of the given attribute names. */
export function hasAttr(el: ExtractedJSXElement, ...names: string[]): boolean {
  return names.some((n) => el.attributes.has(n));
}

/**
 * Build an A11ySignal from a rule and element.
 * Avoids duplicating the 10-field object literal in every rule.
 */
export function makeSignal(
  rule: Pick<WCAGRule, 'id' | 'criterion' | 'severity' | 'complianceTag'>,
  el: ExtractedJSXElement,
  status: A11ySignal['status'],
  confidence: A11ySignal['confidence'] = 'definite',
): A11ySignal {
  return {
    name: rule.id,
    criterion: rule.criterion,
    status,
    severity: rule.severity,
    element: el.tag,
    filePath: el.filePath,
    startLine: el.lineNumber,
    confidence,
    complianceTag: rule.complianceTag,
  };
}

/**
 * Build an A11ySignal for file-level checks (no specific element).
 */
export function makeFileSignal(
  rule: Pick<WCAGRule, 'id' | 'criterion' | 'severity' | 'complianceTag'>,
  filePath: string,
  status: A11ySignal['status'],
  confidence: A11ySignal['confidence'] = 'definite',
): A11ySignal {
  return {
    name: rule.id,
    criterion: rule.criterion,
    status,
    severity: rule.severity,
    element: 'file',
    filePath,
    startLine: 1,
    confidence,
    complianceTag: rule.complianceTag,
  };
}

/** Check if a file path looks like a layout file. */
export function isLayoutFile(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  return /layout|Layout/.test(name);
}

/** Check if a file path looks like a page entry point. */
export function isPageFile(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  return /^(page|index)\.(tsx|jsx|ts|js)$/.test(name);
}

/** Common set of non-semantic interactive elements (div, span). */
export const INTERACTIVE_NON_SEMANTIC = new Set(['div', 'span']);
