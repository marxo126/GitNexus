import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { makeSignal } from '../shared.js';

export const videoCaptions: WCAGRule = {
  id: 'videoCaptions',
  criterion: '1.2.2',
  wcagName: 'Captions (Prerecorded)',
  severity: 'critical',
  complianceTag: 'deaf-specific',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    // Collect track elements for reference
    const hasTrack = elements.some((el) => el.tag === 'track');

    for (const el of elements) {
      if (el.tag !== 'video') continue;

      // Check for captions-related attributes on the video element itself
      const hasCaptionAttr = Array.from(el.attributes.keys()).some((k) =>
        k.toLowerCase().includes('caption'),
      );

      if (hasTrack || hasCaptionAttr) {
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
      } else {
        signals.push(makeSignal(this, el, 'warning', 'heuristic'));
      }
    }
    return signals;
  },
};
