import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, shouldSkipElement, effectiveStatus } from '../shared.js';

export const imgAlt: WCAGRule = {
  id: 'imgAlt',
  criterion: '1.1.1',
  wcagName: 'Non-text Content',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (el.tag !== 'img') continue;
      if (hasAttr(el, 'alt', 'aria-label', 'aria-labelledby')) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, effectiveStatus(el, 'violation')));
      }
    }
    return signals;
  },
};

export const iconButtonLabel: WCAGRule = {
  id: 'iconButtonLabel',
  criterion: '1.1.1',
  wcagName: 'Non-text Content',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (el.tag !== 'button') continue;
      if (el.hasChildren || el.textContent) continue;
      if (hasAttr(el, 'aria-label', 'aria-labelledby')) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, effectiveStatus(el, 'violation')));
      }
    }
    return signals;
  },
};
