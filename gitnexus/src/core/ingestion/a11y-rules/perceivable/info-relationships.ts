import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, makeFileSignal, isLayoutFile, shouldSkipElement } from '../shared.js';

const FORM_TAGS = new Set(['input', 'select', 'textarea']);

export const inputLabel: WCAGRule = {
  id: 'inputLabel',
  criterion: '1.3.1',
  wcagName: 'Info and Relationships',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];

    // Collect label htmlFor targets (both native <label> and PascalCase <Label>)
    const labelForIds = new Set<string>();
    for (const el of elements) {
      if (el.tag === 'label' || el.tag === 'Label' || el.tag === 'FormLabel') {
        const htmlFor = el.attributes.get('htmlFor') || el.attributes.get('for');
        if (typeof htmlFor === 'string') labelForIds.add(htmlFor);
      }
    }

    // Also check: any element in the same enclosing function that is a label-like component
    // suggests the form is using a form library (shadcn, etc.) that handles labeling
    const functionsWithFormField = new Set<string>();
    for (const el of elements) {
      if (el.tag === 'FormField' || el.tag === 'FormItem' || el.tag === 'FormControl') {
        functionsWithFormField.add(el.enclosingFunction);
      }
    }

    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (!FORM_TAGS.has(el.tag)) continue;
      const hasAriaLabel = hasAttr(el, 'aria-label', 'aria-labelledby');
      const id = el.attributes.get('id');
      const hasLabelFor = typeof id === 'string' && labelForIds.has(id);
      const hasWrappingLabel = el.parentTag === 'label';

      // Input is inside a FormField/FormItem/FormControl context — likely labeled by the form library
      const inFormField = functionsWithFormField.has(el.enclosingFunction);

      if (hasAriaLabel || hasLabelFor || hasWrappingLabel) {
        signals.push(makeSignal(this, el, 'pass'));
      } else if (inFormField) {
        // Form library context — likely labeled but we can't prove it statically
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
      } else if (el.attributes.has('placeholder')) {
        // Has placeholder but no label — real a11y concern but not critical
        signals.push(makeSignal(this, el, 'needs-review', 'likely'));
      } else {
        signals.push(makeSignal(this, el, 'needs-review'));
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
    return [makeFileSignal(this, filePath, 'needs-review', 'likely')];
  },
};
