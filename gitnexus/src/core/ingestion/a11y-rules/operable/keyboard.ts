import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, INTERACTIVE_NON_SEMANTIC } from '../shared.js';

export const keyboard: WCAGRule = {
  id: 'keyboard',
  criterion: '2.1.1',
  wcagName: 'Keyboard',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (!INTERACTIVE_NON_SEMANTIC.has(el.tag)) continue;
      if (!el.attributes.has('onClick')) continue;
      if (hasAttr(el, 'onKeyDown', 'onKeyUp', 'onKeyPress') || el.attributes.has('role')) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, 'violation'));
      }
    }
    return signals;
  },
};

export const noKeyboardTrap: WCAGRule = {
  id: 'noKeyboardTrap',
  criterion: '2.1.2',
  wcagName: 'No Keyboard Trap',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (!el.attributes.has('onFocus')) continue;
      if (hasAttr(el, 'onKeyDown')) {
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
      } else {
        signals.push(makeSignal(this, el, 'violation', 'heuristic'));
      }
    }
    return signals;
  },
};
