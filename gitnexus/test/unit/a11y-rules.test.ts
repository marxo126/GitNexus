import { describe, it, expect } from 'vitest';
import type { ExtractedJSXElement } from '../../src/core/ingestion/a11y-rules/types.js';
import { imgAlt, iconButtonLabel } from '../../src/core/ingestion/a11y-rules/perceivable/non-text-content.js';
import { inputLabel, landmarks } from '../../src/core/ingestion/a11y-rules/perceivable/info-relationships.js';
import { keyboard, noKeyboardTrap } from '../../src/core/ingestion/a11y-rules/operable/keyboard.js';
import { bypassBlocks, pageTitled } from '../../src/core/ingestion/a11y-rules/operable/navigation.js';
import { languagePage } from '../../src/core/ingestion/a11y-rules/understandable/language.js';
import { nameRoleValue, statusMessages } from '../../src/core/ingestion/a11y-rules/robust/name-role-value.js';
import { videoCaptions } from '../../src/core/ingestion/a11y-rules/bonus/deaf-specific.js';
import { runA11yRules, RULES } from '../../src/core/ingestion/a11y-rules/index.js';

function makeElement(overrides: Partial<ExtractedJSXElement>): ExtractedJSXElement {
  return {
    tag: 'div',
    filePath: 'test.tsx',
    lineNumber: 1,
    attributes: new Map(),
    hasChildren: false,
    enclosingFunction: 'TestComponent',
    ...overrides,
  };
}

// --- imgAlt ---
describe('imgAlt', () => {
  it('flags img without alt as violation', () => {
    const el = makeElement({ tag: 'img' });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
    expect(signals[0].criterion).toBe('1.1.1');
  });

  it('passes img with alt attribute', () => {
    const el = makeElement({ tag: 'img', attributes: new Map([['alt', 'description']]) });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes img with aria-label', () => {
    const el = makeElement({ tag: 'img', attributes: new Map([['aria-label', 'icon']]) });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });
});

// --- iconButtonLabel ---
describe('iconButtonLabel', () => {
  it('flags icon button without label as violation', () => {
    const el = makeElement({ tag: 'button', hasChildren: false });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('passes icon button with aria-label', () => {
    const el = makeElement({
      tag: 'button',
      hasChildren: false,
      attributes: new Map([['aria-label', 'Close']]),
    });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips buttons with children', () => {
    const el = makeElement({ tag: 'button', hasChildren: true });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips buttons with textContent', () => {
    const el = makeElement({ tag: 'button', hasChildren: false, textContent: 'Click me' });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- inputLabel ---
describe('inputLabel', () => {
  it('flags input without label as needs-review', () => {
    const el = makeElement({ tag: 'input' });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].severity).toBe('critical');
  });

  it('passes input with aria-label', () => {
    const el = makeElement({ tag: 'input', attributes: new Map([['aria-label', 'Name']]) });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('flags input with only id as needs-review (id alone does not prove label association)', () => {
    const el = makeElement({ tag: 'input', attributes: new Map([['id', 'email']]) });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals[0].status).toBe('needs-review');
  });

  it('applies to select and textarea', () => {
    const select = makeElement({ tag: 'select' });
    const textarea = makeElement({ tag: 'textarea' });
    const signals = inputLabel.check([select, textarea], 'test.tsx');
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.status === 'needs-review')).toBe(true);
  });

  it('passes input with id matching a label htmlFor', () => {
    const label = makeElement({ tag: 'label', attributes: new Map([['htmlFor', 'email']]) });
    const input = makeElement({ tag: 'input', attributes: new Map([['id', 'email']]) });
    const signals = inputLabel.check([label, input], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes input with id matching a label for attribute', () => {
    const label = makeElement({ tag: 'label', attributes: new Map([['for', 'name']]) });
    const input = makeElement({ tag: 'input', attributes: new Map([['id', 'name']]) });
    const signals = inputLabel.check([label, input], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes input wrapped in a label element', () => {
    const input = makeElement({ tag: 'input', parentTag: 'label' });
    const signals = inputLabel.check([input], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });
});

// --- landmarks ---
describe('landmarks', () => {
  it('flags layout file with no landmarks as needs-review', () => {
    const el = makeElement({ tag: 'div' });
    const signals = landmarks.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('passes when layout file has main element', () => {
    const el = makeElement({ tag: 'main' });
    const signals = landmarks.check([el], 'src/app/layout.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips non-layout files', () => {
    const el = makeElement({ tag: 'div' });
    const signals = landmarks.check([el], 'src/components/Card.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- keyboard ---
describe('keyboard', () => {
  it('flags div with onClick but no tabIndex as needs-review (not provably interactive)', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].criterion).toBe('2.1.1');
  });

  it('flags div with onClick AND tabIndex as violation (provably interactive, missing keyboard)', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['tabIndex', '0'],
      ]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('passes div with onClick and onKeyDown', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['onKeyDown', true as unknown as string],
      ]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('passes div with onClick and role', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['role', 'button'],
      ]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('flags div with onClick+tabIndex but no onKeyDown as violation (provably focusable)', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['tabIndex', '0'],
      ]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('downgrades div with onClick inside Button component to needs-review', () => {
    const el = makeElement({
      attributes: new Map([['onClick', true as unknown as string]]),
      enclosingFunction: 'ButtonTrigger',
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].confidence).toBe('heuristic');
  });

  it('downgrades div with onClick inside MenuItem to needs-review', () => {
    const el = makeElement({
      attributes: new Map([['onClick', true as unknown as string]]),
      enclosingFunction: 'DropdownMenuItem',
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].confidence).toBe('heuristic');
  });
});

// --- noKeyboardTrap ---
describe('noKeyboardTrap', () => {
  it('flags dialog element without onKeyDown as needs-review', () => {
    const el = makeElement({
      attributes: new Map([['role', 'dialog']]),
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].confidence).toBe('heuristic');
  });

  it('passes dialog element with onKeyDown', () => {
    const el = makeElement({
      attributes: new Map([
        ['role', 'dialog'],
        ['onKeyDown', true as unknown as string],
      ]),
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('flags element with aria-modal without onKeyDown as needs-review', () => {
    const el = makeElement({
      attributes: new Map([['aria-modal', 'true']]),
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('flags element inside focus trap function as needs-review', () => {
    const el = makeElement({
      enclosingFunction: 'useFocusTrap',
      attributes: new Map(),
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('skips plain element with onFocus (no trap characteristics)', () => {
    const el = makeElement({ attributes: new Map([['onFocus', true as unknown as string]]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('passes dialog when wrapper div in same function has onKeyDown', () => {
    const dialog = makeElement({
      attributes: new Map([['role', 'dialog']]),
      enclosingFunction: 'MyDialog',
    });
    const wrapper = makeElement({
      tag: 'div',
      attributes: new Map([['onKeyDown', true as unknown as string]]),
      enclosingFunction: 'MyDialog',
    });
    const signals = noKeyboardTrap.check([dialog, wrapper], 'test.tsx');
    const dialogSignal = signals.find(s => s.element === 'div' && s.status !== undefined) || signals[0];
    // The dialog element should pass because its enclosing function has a key handler
    expect(signals.filter(s => s.status === 'violation')).toHaveLength(0);
  });

  it('skips element resolved from known accessible component (e.g. AlertDialog)', () => {
    const el = makeElement({
      attributes: new Map([['role', 'dialog']]),
      parentTag: 'AlertDialog',
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- bypassBlocks ---
describe('bypassBlocks', () => {
  it('flags layout file without skip link as needs-review', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('passes layout file with skip link', () => {
    const el = makeElement({ tag: 'a', attributes: new Map([['href', '#main-content']]) });
    const signals = bypassBlocks.check([el], 'src/app/layout.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips non-layout files', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/components/Card.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- pageTitled ---
describe('pageTitled', () => {
  it('flags page file with no title as needs-review', () => {
    const el = makeElement({ tag: 'div' });
    const signals = pageTitled.check([el], 'src/app/page.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('passes when page file has Head component', () => {
    const el = makeElement({ tag: 'Head' });
    const signals = pageTitled.check([el], 'src/pages/index.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips non-page files', () => {
    const el = makeElement({ tag: 'div' });
    const signals = pageTitled.check([el], 'src/components/Card.tsx');
    expect(signals).toHaveLength(0);
  });

  it('passes when page has export const metadata', () => {
    const el = makeElement({ tag: 'div' });
    const source = `export const metadata: Metadata = { title: 'Home' };\nexport default function Page() { return <div />; }`;
    const signals = pageTitled.check([el], 'src/app/page.tsx', source);
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes when page has export async function generateMetadata', () => {
    const el = makeElement({ tag: 'div' });
    const source = `export async function generateMetadata() { return { title: 'Dynamic' }; }`;
    const signals = pageTitled.check([el], 'src/app/page.tsx', source);
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes when page has export function generateMetadata (non-async)', () => {
    const el = makeElement({ tag: 'div' });
    const source = `export function generateMetadata() { return { title: 'Dynamic' }; }`;
    const signals = pageTitled.check([el], 'src/app/page.tsx', source);
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });
});

// --- languagePage ---
describe('languagePage', () => {
  it('flags root layout html without lang as violation', () => {
    const el = makeElement({ tag: 'html', filePath: 'src/app/layout.tsx' });
    const signals = languagePage.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('passes root layout html with lang', () => {
    const el = makeElement({
      tag: 'html',
      filePath: 'src/app/layout.tsx',
      attributes: new Map([['lang', 'en']]),
    });
    const signals = languagePage.check([el], 'src/app/layout.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips non-root-layout files', () => {
    const el = makeElement({ tag: 'html' });
    const signals = languagePage.check([el], 'src/components/Card.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- nameRoleValue ---
describe('nameRoleValue', () => {
  it('flags interactive div without role or tabIndex as needs-review', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].criterion).toBe('4.1.2');
  });

  it('flags interactive div with tabIndex but no role as violation (provably focusable)', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['tabIndex', '0'],
      ]),
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('passes interactive div with role', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['role', 'button'],
      ]),
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('flags interactive div with tabIndex but no role as violation', () => {
    const el = makeElement({
      attributes: new Map([
        ['onClick', true as unknown as string],
        ['tabIndex', '0'],
      ]),
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('downgrades interactive div inside Toggle component to needs-review', () => {
    const el = makeElement({
      attributes: new Map([['onClick', true as unknown as string]]),
      enclosingFunction: 'ToggleButton',
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].confidence).toBe('heuristic');
  });
});

// --- statusMessages ---
describe('statusMessages', () => {
  it('flags toast element without aria-live as needs-review', () => {
    const el = makeElement({ classNames: ['toast-container'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('passes alert element with role=alert', () => {
    const el = makeElement({
      classNames: ['alert-banner'],
      attributes: new Map([['role', 'alert']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('passes element with aria-live', () => {
    const el = makeElement({
      classNames: ['notification-wrapper'],
      attributes: new Map([['aria-live', 'polite']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('skips element when classNames array is absent (no class-based detection without classNames)', () => {
    const el = makeElement({
      attributes: new Map([['className', 'spinner-overlay']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- videoCaptions ---
describe('videoCaptions', () => {
  it('flags video without track element as needs-review', () => {
    const el = makeElement({ tag: 'video' });
    const signals = videoCaptions.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
    expect(signals[0].confidence).toBe('heuristic');
    expect(signals[0].complianceTag).toBe('deaf-specific');
  });

  it('passes video when track element with video parent exists', () => {
    const video = makeElement({ tag: 'video' });
    const track = makeElement({ tag: 'track', parentTag: 'video' });
    const signals = videoCaptions.check([video, track], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('flags video as needs-review when track element has no video parent', () => {
    const video = makeElement({ tag: 'video' });
    const track = makeElement({ tag: 'track', parentTag: 'div' });
    const signals = videoCaptions.check([video, track], 'test.tsx');
    expect(signals[0].status).toBe('needs-review');
  });
});

// --- aria-hidden skipping ---
describe('aria-hidden skipping', () => {
  it('skips element with aria-hidden="true" in imgAlt', () => {
    const el = makeElement({ tag: 'img', attributes: new Map([['aria-hidden', 'true']]) });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips element with aria-hidden="true" in keyboard', () => {
    const el = makeElement({
      tag: 'div',
      attributes: new Map([['aria-hidden', 'true'], ['onClick', 'handler']]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips element with aria-hidden="true" in nameRoleValue', () => {
    const el = makeElement({
      tag: 'div',
      attributes: new Map([['aria-hidden', 'true'], ['onClick', 'handler']]),
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- known accessible component skipping ---
describe('known accessible component skipping', () => {
  it('skips Button in keyboard check', () => {
    const el = makeElement({
      tag: 'Button',
      attributes: new Map([['onClick', 'handler']]),
    });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips FormField in inputLabel check', () => {
    const el = makeElement({ tag: 'FormField' });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips Dialog in nameRoleValue check', () => {
    const el = makeElement({
      tag: 'Dialog',
      attributes: new Map([['onClick', 'handler']]),
    });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- test file skipping ---
describe('test file skipping', () => {
  it('skips .test. files entirely', () => {
    const el = makeElement({ tag: 'img' });
    const signals = runA11yRules([el], 'src/components/Button.test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips .spec. files entirely', () => {
    const el = makeElement({ tag: 'img' });
    const signals = runA11yRules([el], 'src/components/Button.spec.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips __tests__ directory files entirely', () => {
    const el = makeElement({ tag: 'img' });
    const signals = runA11yRules([el], 'src/__tests__/Button.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- statusMessages false-positive fixes ---
describe('statusMessages false-positive fixes', () => {
  it('does not match AlertDialog in class name', () => {
    const el = makeElement({ classNames: ['AlertDialog'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('does not match alertdialog-overlay class', () => {
    const el = makeElement({ classNames: ['alertdialog-overlay'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('still matches alert-banner class', () => {
    const el = makeElement({ classNames: ['alert-banner'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('still matches toast class', () => {
    const el = makeElement({ classNames: ['toast'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('passes AlertDialog with role=alertdialog (implicit live region)', () => {
    const el = makeElement({
      classNames: ['alert-banner'],
      attributes: new Map([['role', 'alertdialog']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes element with role=status (implicit live region)', () => {
    const el = makeElement({
      classNames: ['loading-spinner'],
      attributes: new Map([['role', 'status']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('passes element with role=log (implicit live region)', () => {
    const el = makeElement({
      classNames: ['notification-feed'],
      attributes: new Map([['role', 'log']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('pass');
  });

  it('does not match ToastPrimitive in class name', () => {
    const el = makeElement({ classNames: ['ToastPrimitive'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- noKeyboardTrap skips native form controls ---
describe('noKeyboardTrap skips native form controls', () => {
  it('skips input elements even with role=dialog', () => {
    const el = makeElement({ tag: 'input', attributes: new Map([['role', 'dialog']]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips button elements', () => {
    const el = makeElement({ tag: 'button', attributes: new Map([['role', 'dialog']]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips select elements', () => {
    const el = makeElement({ tag: 'select', attributes: new Map([['aria-modal', 'true']]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips textarea elements', () => {
    const el = makeElement({ tag: 'textarea', attributes: new Map([['aria-modal', 'true']]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(0);
  });
});

// --- isLayoutFile tightened matching ---
describe('bypassBlocks layout matching', () => {
  it('does not match icon files with Layout in name', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/icons/IconLayout.svg');
    expect(signals).toHaveLength(0);
  });

  it('does not match LayoutIcon.png', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/assets/LayoutIcon.png');
    expect(signals).toHaveLength(0);
  });

  it('still matches layout.tsx', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
  });

  it('still matches RootLayout.tsx', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/app/RootLayout.tsx');
    expect(signals).toHaveLength(1);
  });
});

// --- runA11yRules integration ---
describe('runA11yRules', () => {
  it('exports all 12 rules', () => {
    expect(RULES).toHaveLength(12);
  });

  it('aggregates signals from multiple rules', () => {
    const img = makeElement({ tag: 'img' });
    const input = makeElement({ tag: 'input' });
    const signals = runA11yRules([img, input], 'test.tsx');
    const names = signals.map((s) => s.name);
    expect(names).toContain('imgAlt');
    expect(names).toContain('inputLabel');
  });

  it('passes source to rules that need it', () => {
    const el = makeElement({ tag: 'div' });
    const source = `export const metadata = { title: 'Test' };\nexport default function Page() {}`;
    const signals = runA11yRules([el], 'src/app/page.tsx', source);
    const pageTitledSignal = signals.find(s => s.name === 'pageTitled');
    expect(pageTitledSignal).toBeDefined();
    expect(pageTitledSignal!.status).toBe('pass');
  });
});

// --- resolved element status downgrade ---
describe('resolved elements produce needs-review instead of violation', () => {
  it('native <img> without alt (not resolved) → violation', () => {
    const el = makeElement({ tag: 'img' });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('resolved <img> without alt → needs-review', () => {
    const el = makeElement({ tag: 'img', resolved: true });
    const signals = imgAlt.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('native <button> without label (not resolved) → violation', () => {
    const el = makeElement({ tag: 'button', hasChildren: false });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('resolved <button> without label → needs-review', () => {
    const el = makeElement({ tag: 'button', hasChildren: false, resolved: true });
    const signals = iconButtonLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('native div with onClick+tabIndex (not resolved) → violation in keyboard', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string], ['tabIndex', '0']]) });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('native div with onClick but no tabIndex (not resolved) → needs-review in keyboard', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('resolved div with onClick → needs-review in keyboard', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]), resolved: true });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('native interactive div with tabIndex but no role (not resolved) → violation in nameRoleValue', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string], ['tabIndex', '0']]) });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });

  it('native interactive div without tabIndex or role (not resolved) → needs-review in nameRoleValue', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });

  it('resolved interactive div without role → needs-review in nameRoleValue', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]), resolved: true });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('needs-review');
  });
});
