import type { WCAGRule, ExtractedJSXElement, A11ySignal } from './types.js';
import { imgAlt, iconButtonLabel } from './perceivable/non-text-content.js';
import { inputLabel, landmarks } from './perceivable/info-relationships.js';
import { keyboard, noKeyboardTrap } from './operable/keyboard.js';
import { bypassBlocks, pageTitled } from './operable/navigation.js';
import { languagePage } from './understandable/language.js';
import { nameRoleValue, statusMessages } from './robust/name-role-value.js';
import { videoCaptions } from './bonus/deaf-specific.js';

export type { WCAGRule, A11ySignal, ExtractedJSXElement } from './types.js';

const RULES: WCAGRule[] = [
  imgAlt,
  iconButtonLabel,
  inputLabel,
  landmarks,
  keyboard,
  noKeyboardTrap,
  bypassBlocks,
  pageTitled,
  languagePage,
  nameRoleValue,
  statusMessages,
  videoCaptions,
];

export function runA11yRules(
  elements: ExtractedJSXElement[],
  filePath: string,
  source?: string,
): A11ySignal[] {
  // Skip test files -- not production code
  if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('/__tests__/')) return [];

  const signals: A11ySignal[] = [];
  for (const rule of RULES) {
    signals.push(...rule.check(elements, filePath, source));
  }
  return signals;
}

export { RULES };
