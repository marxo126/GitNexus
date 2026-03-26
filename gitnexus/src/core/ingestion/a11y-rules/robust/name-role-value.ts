import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, INTERACTIVE_NON_SEMANTIC, shouldSkipElement, effectiveStatus } from '../shared.js';

const WRAPPER_PATTERNS = /Button|Trigger|MenuItem|Link|Tab|Toggle|Switch|Checkbox|Radio/i;

export const nameRoleValue: WCAGRule = {
  id: 'nameRoleValue',
  criterion: '4.1.2',
  wcagName: 'Name, Role, Value',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (!INTERACTIVE_NON_SEMANTIC.has(el.tag)) continue;
      if (!hasAttr(el, 'onClick', 'onKeyDown')) continue;

      // Has explicit role -> pass
      if (el.attributes.has('role')) {
        signals.push(makeSignal(this, el, 'pass'));
        continue;
      }

      // tabIndex="0" or positive = in tab order = deliberately interactive, needs role
      // tabIndex="-1" = programmatic focus only = not interactive
      const tabIdx = el.attributes.get('tabIndex');
      if (tabIdx !== undefined && tabIdx !== '-1' && tabIdx !== true) {
        signals.push(makeSignal(this, el, effectiveStatus(el, 'violation')));
        continue;
      }

      // Inside a known accessible component wrapper -> needs-review
      if (WRAPPER_PATTERNS.test(el.enclosingFunction)) {
        signals.push(makeSignal(this, el, 'needs-review', 'heuristic'));
        continue;
      }

      // onClick without tabIndex → element not focusable, can't determine intent
      signals.push(makeSignal(this, el, 'needs-review'));
    }
    return signals;
  },
};

/** Match status patterns as whole words/segments, not substrings.
 *  e.g. "alert" matches "alert-banner" but NOT "AlertDialog" (which is PascalCase component).
 *  Only match when the keyword is a standalone segment (kebab-case boundary or exact match),
 *  not when it's a substring of a PascalCase component class like "AlertDialogPrimitive". */
const STATUS_KEYWORDS = ['toast', 'alert', 'notification', 'loading', 'spinner'];

/** Check if a class name contains a status keyword as a standalone segment.
 *  Matches: "alert", "alert-banner", "toast-container", "my-alert"
 *  Does NOT match: "AlertDialog", "AlertDialogPrimitive", "ToastPrimitive" */
function hasStatusClassName(classNames: string[]): boolean {
  for (const cls of classNames) {
    // Skip PascalCase component-like class names (e.g. AlertDialogPrimitive, ToastViewport)
    if (/^[A-Z]/.test(cls)) continue;
    const lower = cls.toLowerCase();
    for (const kw of STATUS_KEYWORDS) {
      // Match as whole word or kebab-case segment
      const re = new RegExp(`(?:^|-)${kw}(?:$|-)`);
      if (re.test(lower)) return true;
    }
  }
  return false;
}

/** Roles with implicit live region semantics (no explicit aria-live needed) */
const IMPLICIT_LIVE_ROLES = new Set(['alert', 'alertdialog', 'status', 'log']);

export const statusMessages: WCAGRule = {
  id: 'statusMessages',
  criterion: '4.1.3',
  wcagName: 'Status Messages',
  severity: 'serious',
  complianceTag: 'eu-recommended',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      const classNames = el.classNames ?? [];
      if (!hasStatusClassName(classNames)) continue;
      const role = el.attributes.get('role');
      if (
        el.attributes.has('aria-live') ||
        (typeof role === 'string' && IMPLICIT_LIVE_ROLES.has(role))
      ) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, 'needs-review'));
      }
    }
    return signals;
  },
};
