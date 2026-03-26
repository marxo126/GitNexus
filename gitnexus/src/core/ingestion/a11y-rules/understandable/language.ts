import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { makeSignal, makeFileSignal, shouldSkipElement } from '../shared.js';

function isRootLayout(filePath: string): boolean {
  return /layout\.(tsx|jsx|ts|js)$/.test(filePath) && /app[/\\]layout/.test(filePath);
}

export const languagePage: WCAGRule = {
  id: 'languagePage',
  criterion: '3.1.1',
  wcagName: 'Language of Page',
  severity: 'serious',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[], filePath: string): A11ySignal[] {
    if (!isRootLayout(filePath)) return [];
    const htmlEl = elements.find((el) => el.tag === 'html');
    if (!htmlEl) {
      return [makeFileSignal(this, filePath, 'needs-review', 'likely')];
    }
    const hasLang = htmlEl.attributes.has('lang');
    return [makeSignal(this, htmlEl, hasLang ? 'pass' : 'violation')];
  },
};
