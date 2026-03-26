import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { makeSignal, shouldSkipElement } from '../shared.js';

export const videoCaptions: WCAGRule = {
  id: 'videoCaptions',
  criterion: '1.2.2',
  wcagName: 'Captions (Prerecorded)',
  severity: 'critical',
  complianceTag: 'deaf-specific',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];

    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (el.tag !== 'video') continue;

      // Check for captions-related attributes on the video element itself
      const hasCaptionAttr = Array.from(el.attributes.keys()).some((k) =>
        k.toLowerCase().includes('caption'),
      );

      // Check if any track element in the same file has a video parent
      const hasTrackChild = elements.some(
        (t) => t.tag === 'track' && t.parentTag === 'video',
      );

      if (hasTrackChild || hasCaptionAttr) {
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
      } else {
        signals.push(makeSignal(this, el, 'needs-review', 'heuristic'));
      }
    }
    return signals;
  },
};
