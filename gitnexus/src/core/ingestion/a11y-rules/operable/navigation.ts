import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { makeFileSignal, isLayoutFile, isPageFile } from '../shared.js';

export const bypassBlocks: WCAGRule = {
  id: 'bypassBlocks',
  criterion: '2.4.1',
  wcagName: 'Bypass Blocks',
  severity: 'serious',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[], filePath: string): A11ySignal[] {
    if (!isLayoutFile(filePath)) return [];
    const hasSkipLink = elements.some((el) => {
      if (el.tag !== 'a') return false;
      const href = el.attributes.get('href');
      if (typeof href !== 'string') return false;
      return href.includes('#main') || href.includes('#content');
    });
    return [makeFileSignal(this, filePath, hasSkipLink ? 'pass' : 'violation')];
  },
};

export const pageTitled: WCAGRule = {
  id: 'pageTitled',
  criterion: '2.4.2',
  wcagName: 'Page Titled',
  severity: 'serious',
  complianceTag: 'eu-recommended',
  check(elements: ExtractedJSXElement[], filePath: string): A11ySignal[] {
    if (!isPageFile(filePath)) return [];
    const hasTitle = elements.some(
      (el) => el.tag === 'title' || el.tag === 'Head',
    );
    return [makeFileSignal(this, filePath, hasTitle ? 'pass' : 'warning', 'likely')];
  },
};
