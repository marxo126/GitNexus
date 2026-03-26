import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { makeFileSignal, isLayoutFile, isPageFile, shouldSkipElement } from '../shared.js';

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
      return href.includes('#main') || href.includes('#content') ||
        href.includes('#skip') || href.includes('#skip-to-content') ||
        href.includes('#skip-nav') || href.includes('#maincontent') ||
        href.includes('#primary');
    });
    return [makeFileSignal(this, filePath, hasSkipLink ? 'pass' : 'needs-review')];
  },
};

export const pageTitled: WCAGRule = {
  id: 'pageTitled',
  criterion: '2.4.2',
  wcagName: 'Page Titled',
  severity: 'serious',
  complianceTag: 'eu-recommended',
  check(elements: ExtractedJSXElement[], filePath: string, source?: string): A11ySignal[] {
    if (!isPageFile(filePath)) return [];
    const hasTitle = elements.some(
      (el) => el.tag === 'title' || el.tag === 'Head',
    );
    const hasMetadata = source != null &&
      /export\s+(const|async\s+function|function)\s+(metadata|generateMetadata)\b/.test(source);
    if (hasTitle || hasMetadata) {
      return [makeFileSignal(this, filePath, 'pass', 'likely')];
    }
    return [makeFileSignal(this, filePath, 'needs-review', 'likely')];
  },
};
