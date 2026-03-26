/**
 * Shared helpers for WCAG a11y rules.
 *
 * Extracted to avoid copy-paste duplication across rule files.
 */

import type { WCAGRule, ExtractedJSXElement, A11ySignal, SignalStatus } from './types.js';
import { isKnownAccessibleComponent } from './component-resolver.js';

/** Check if element should be skipped (hidden or known accessible third-party). */
export function shouldSkipElement(el: ExtractedJSXElement): boolean {
  if (el.attributes.get('aria-hidden') === 'true') return true;
  if (isKnownAccessibleComponent(el.tag)) return true;
  return false;
}

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
    enclosingFunction: el.enclosingFunction,
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
    enclosingFunction: undefined,
  };
}

/** Check if a file path looks like a layout file. */
export function isLayoutFile(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  // Match layout.tsx, Layout.tsx, RootLayout.tsx, etc. but NOT IconLayout.svg or LayoutIcon.png
  return /^[A-Za-z]*[Ll]ayout\.(tsx|jsx|ts|js)$/.test(name);
}

/** Check if a file path looks like a page entry point. */
export function isPageFile(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  return /^(page|index)\.(tsx|jsx|ts|js)$/.test(name);
}

/** Elements from component resolution should never produce violations — only needs-review */
export function effectiveStatus(el: ExtractedJSXElement, intendedStatus: SignalStatus): SignalStatus {
  if (el.resolved && intendedStatus === 'violation') return 'needs-review';
  return intendedStatus;
}

/** Common set of non-semantic interactive elements (div, span). */
export const INTERACTIVE_NON_SEMANTIC = new Set(['div', 'span']);
