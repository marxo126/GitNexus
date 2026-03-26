import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, INTERACTIVE_NON_SEMANTIC } from '../shared.js';

export const nameRoleValue: WCAGRule = {
  id: 'nameRoleValue',
  criterion: '4.1.2',
  wcagName: 'Name, Role, Value',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (!INTERACTIVE_NON_SEMANTIC.has(el.tag)) continue;
      if (!hasAttr(el, 'onClick', 'onKeyDown')) continue;
      if (el.attributes.has('role')) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, 'violation'));
      }
    }
    return signals;
  },
};

const STATUS_PATTERNS = ['toast', 'alert', 'notification', 'loading', 'spinner'];

export const statusMessages: WCAGRule = {
  id: 'statusMessages',
  criterion: '4.1.3',
  wcagName: 'Status Messages',
  severity: 'serious',
  complianceTag: 'eu-recommended',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      const classNames = el.classNames ?? [];
      const classStr = classNames.join(' ').toLowerCase();
      const isStatusEl = STATUS_PATTERNS.some((p) => classStr.includes(p));
      if (!isStatusEl) {
        // Also check className attribute as fallback
        const classAttr = el.attributes.get('className');
        if (typeof classAttr === 'string') {
          const lower = classAttr.toLowerCase();
          if (!STATUS_PATTERNS.some((p) => lower.includes(p))) continue;
        } else {
          continue;
        }
      }
      const role = el.attributes.get('role');
      if (
        el.attributes.has('aria-live') ||
        role === 'status' ||
        role === 'alert'
      ) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, 'violation'));
      }
    }
    return signals;
  },
};
