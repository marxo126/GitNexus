import type { WCAGRule, ExtractedJSXElement, A11ySignal } from '../types.js';
import { hasAttr, makeSignal, INTERACTIVE_NON_SEMANTIC, shouldSkipElement, effectiveStatus } from '../shared.js';
import { isKnownAccessibleComponent } from '../component-resolver.js';

const WRAPPER_PATTERNS = /Button|Trigger|MenuItem|Link|Tab|Toggle|Switch|Checkbox|Radio/i;

export const keyboard: WCAGRule = {
  id: 'keyboard',
  criterion: '2.1.1',
  wcagName: 'Keyboard',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];
    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      if (!INTERACTIVE_NON_SEMANTIC.has(el.tag)) continue;
      if (!el.attributes.has('onClick')) continue;

      // Has keyboard handler or role -> pass
      if (hasAttr(el, 'onKeyDown', 'onKeyUp', 'onKeyPress') || el.attributes.has('role')) {
        signals.push(makeSignal(this, el, 'pass'));
        continue;
      }

      // tabIndex="0" or positive = in tab order = deliberately interactive
      // tabIndex="-1" = programmatic focus only (e.g., dialog container) = not interactive
      const tabIdx = el.attributes.get('tabIndex');
      if (tabIdx !== undefined && tabIdx !== '-1' && tabIdx !== true) {
        signals.push(makeSignal(this, el, effectiveStatus(el, 'violation')));
        continue;
      }

      // Inside a known accessible component wrapper -> needs-review
      if (WRAPPER_PATTERNS.test(el.enclosingFunction)) {
        signals.push(makeSignal(this, el, 'needs-review', 'heuristic'));
        continue;
      }

      // onClick without tabIndex → can't reach by keyboard, so can't prove it's a barrier
      // Could be event management (stopPropagation, backdrop dismiss) or mouse-only shortcut
      signals.push(makeSignal(this, el, 'needs-review'));
    }
    return signals;
  },
};

const FOCUS_TRAP_ROLES = new Set(['dialog', 'menu']);
const FOCUS_TRAP_FUNCTION_PATTERNS = /useFocusTrap|createFocusTrap|FocusTrap/i;
/** Native form controls that cannot be keyboard traps */
const NATIVE_FORM_CONTROLS = new Set(['input', 'select', 'textarea', 'button']);

export const noKeyboardTrap: WCAGRule = {
  id: 'noKeyboardTrap',
  criterion: '2.1.2',
  wcagName: 'No Keyboard Trap',
  severity: 'critical',
  complianceTag: 'eu-required',
  check(elements: ExtractedJSXElement[]): A11ySignal[] {
    const signals: A11ySignal[] = [];

    // Build a set of functions that have any onKeyDown/onKeyUp/onKeyPress handler
    const functionsWithKeyHandler = new Set<string>();
    for (const el of elements) {
      if (el.attributes.has('onKeyDown') || el.attributes.has('onKeyUp') || el.attributes.has('onKeyPress')) {
        functionsWithKeyHandler.add(el.enclosingFunction);
      }
    }

    for (const el of elements) {
      if (shouldSkipElement(el)) continue;
      // Skip native form controls -- they cannot be keyboard traps
      if (NATIVE_FORM_CONTROLS.has(el.tag)) continue;
      // Skip known accessible components (Dialog, Modal, AlertDialog, etc. handle escape internally)
      if (el.parentTag && isKnownAccessibleComponent(el.parentTag)) continue;
      // Only flag elements with focus-trapping characteristics
      const role = el.attributes.get('role');
      const hasModal = el.attributes.has('modal') || el.attributes.has('aria-modal');
      const hasTrapRole = typeof role === 'string' && FOCUS_TRAP_ROLES.has(role);
      const hasTrapFunction = FOCUS_TRAP_FUNCTION_PATTERNS.test(el.enclosingFunction);

      if (!hasTrapRole && !hasModal && !hasTrapFunction) continue;

      // Skip if the enclosing function already has keyboard handling
      if (functionsWithKeyHandler.has(el.enclosingFunction)) {
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
        continue;
      }

      if (hasAttr(el, 'onKeyDown')) {
        signals.push(makeSignal(this, el, 'pass', 'heuristic'));
      } else {
        signals.push(makeSignal(this, el, 'needs-review', 'heuristic'));
      }
    }
    return signals;
  },
};
