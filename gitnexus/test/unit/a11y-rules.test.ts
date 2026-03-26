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
  it('flags input without label as violation', () => {
    const el = makeElement({ tag: 'input' });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
    expect(signals[0].severity).toBe('critical');
  });

  it('passes input with aria-label', () => {
    const el = makeElement({ tag: 'input', attributes: new Map([['aria-label', 'Name']]) });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('passes input with id (implies htmlFor label)', () => {
    const el = makeElement({ tag: 'input', attributes: new Map([['id', 'email']]) });
    const signals = inputLabel.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });

  it('applies to select and textarea', () => {
    const select = makeElement({ tag: 'select' });
    const textarea = makeElement({ tag: 'textarea' });
    const signals = inputLabel.check([select, textarea], 'test.tsx');
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.status === 'violation')).toBe(true);
  });
});

// --- landmarks ---
describe('landmarks', () => {
  it('warns when layout file has no landmarks', () => {
    const el = makeElement({ tag: 'div' });
    const signals = landmarks.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('warning');
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
  it('flags div with onClick but no keyboard handler as violation', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = keyboard.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
    expect(signals[0].criterion).toBe('2.1.1');
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
});

// --- noKeyboardTrap ---
describe('noKeyboardTrap', () => {
  it('flags element with onFocus but no onKeyDown as violation', () => {
    const el = makeElement({ attributes: new Map([['onFocus', true as unknown as string]]) });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
    expect(signals[0].confidence).toBe('heuristic');
  });

  it('passes element with onFocus and onKeyDown', () => {
    const el = makeElement({
      attributes: new Map([
        ['onFocus', true as unknown as string],
        ['onKeyDown', true as unknown as string],
      ]),
    });
    const signals = noKeyboardTrap.check([el], 'test.tsx');
    expect(signals[0].status).toBe('pass');
  });
});

// --- bypassBlocks ---
describe('bypassBlocks', () => {
  it('flags layout file without skip link as violation', () => {
    const el = makeElement({ tag: 'div' });
    const signals = bypassBlocks.check([el], 'src/app/layout.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
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
  it('warns when page file has no title', () => {
    const el = makeElement({ tag: 'div' });
    const signals = pageTitled.check([el], 'src/app/page.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('warning');
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
  it('flags interactive div without role as violation', () => {
    const el = makeElement({ attributes: new Map([['onClick', true as unknown as string]]) });
    const signals = nameRoleValue.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
    expect(signals[0].criterion).toBe('4.1.2');
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
});

// --- statusMessages ---
describe('statusMessages', () => {
  it('flags toast element without aria-live as violation', () => {
    const el = makeElement({ classNames: ['toast-container'] });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
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

  it('detects via className attribute when classNames array is absent', () => {
    const el = makeElement({
      attributes: new Map([['className', 'spinner-overlay']]),
    });
    const signals = statusMessages.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('violation');
  });
});

// --- videoCaptions ---
describe('videoCaptions', () => {
  it('warns video without track element', () => {
    const el = makeElement({ tag: 'video' });
    const signals = videoCaptions.check([el], 'test.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe('warning');
    expect(signals[0].confidence).toBe('heuristic');
    expect(signals[0].complianceTag).toBe('deaf-specific');
  });

  it('passes video when track element exists', () => {
    const video = makeElement({ tag: 'video' });
    const track = makeElement({ tag: 'track' });
    const signals = videoCaptions.check([video, track], 'test.tsx');
    expect(signals[0].status).toBe('pass');
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
});
