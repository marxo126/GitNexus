import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, makeFileSignal, isLayoutFile } from '../shared.js';

const FORM_TAGS = new Set(['input', 'select', 'textarea']);

export const inputLabel: WCAGRule = {
  id: 'inputLabel',
  criterion: '1.3.1',
  wcagName: 'Info and Relationships',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (!FORM_TAGS.has(el.tag)) continue;
      if (hasAttr(el, 'aria-label', 'aria-labelledby', 'id')) {
        signals.push(makeSignal(this, el, 'pass'));
      } else {
        signals.push(makeSignal(this, el, 'violation'));
      }
    }
    return signals;
  },
};

export const landmarks: WCAGRule = {
  id: 'landmarks',
  criterion: '1.3.1',
  wcagName: 'Info and Relationships',
  severity: 'serious',
  complianceTag: 'eu-recommended',
  check(elements: ExtractedJSXElement[], filePath: string): A11ySignal[] {
    if (!isLayoutFile(filePath)) return [];
    const landmarkTags = new Set(['main', 'nav', 'header']);
    const hasLandmark = elements.some((el) => landmarkTags.has(el.tag));
    if (hasLandmark) {
      return [makeFileSignal(this, filePath, 'pass')];
    }
    return [makeFileSignal(this, filePath, 'warning', 'likely')];
  },
};
