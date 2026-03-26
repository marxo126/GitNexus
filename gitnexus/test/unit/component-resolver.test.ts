import { describe, it, expect } from 'vitest';
import type { ExtractedJSXElement } from '../../src/core/ingestion/a11y-rules/types.js';
import {
  buildComponentMap,
  resolveComponent,
  resolveComponentsInFile,
  isKnownAccessibleComponent,
  KNOWN_ACCESSIBLE_COMPONENTS,
} from '../../src/core/ingestion/a11y-rules/component-resolver.js';
import { inputLabel } from '../../src/core/ingestion/a11y-rules/perceivable/info-relationships.js';

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

// --- buildComponentMap ---
describe('buildComponentMap', () => {
  it('groups elements by enclosingFunction', () => {
    const elements = [
      makeElement({ tag: 'input', enclosingFunction: 'FormField' }),
      makeElement({ tag: 'label', enclosingFunction: 'FormField' }),
      makeElement({ tag: 'button', enclosingFunction: 'SubmitButton' }),
    ];
    const map = buildComponentMap(elements);
    expect(map.get('FormField')).toHaveLength(2);
    expect(map.get('SubmitButton')).toHaveLength(1);
  });

  it('skips elements with <module> enclosingFunction', () => {
    const elements = [
      makeElement({ tag: 'div', enclosingFunction: '<module>' }),
    ];
    const map = buildComponentMap(elements);
    expect(map.size).toBe(0);
  });

  it('skips elements with <anonymous> enclosingFunction', () => {
    const elements = [
      makeElement({ tag: 'div', enclosingFunction: '<anonymous>' }),
    ];
    const map = buildComponentMap(elements);
    expect(map.size).toBe(0);
  });

  it('skips elements with empty enclosingFunction', () => {
    const elements = [
      makeElement({ tag: 'div', enclosingFunction: '' }),
    ];
    const map = buildComponentMap(elements);
    expect(map.size).toBe(0);
  });
});

// --- resolveComponent ---
describe('resolveComponent', () => {
  it('follows one level of component resolution', () => {
    const elements = [
      makeElement({ tag: 'input', enclosingFunction: 'FormField' }),
      makeElement({ tag: 'label', enclosingFunction: 'FormField' }),
    ];
    const map = buildComponentMap(elements);
    const resolved = resolveComponent('FormField', map);
    expect(resolved).toHaveLength(2);
    expect(resolved.map(r => r.tag)).toEqual(['input', 'label']);
  });

  it('follows two levels of component resolution', () => {
    const elements = [
      makeElement({ tag: 'input', enclosingFunction: 'InnerInput' }),
      makeElement({ tag: 'InnerInput', enclosingFunction: 'FormField' }),
    ];
    const map = buildComponentMap(elements);
    const resolved = resolveComponent('FormField', map);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].tag).toBe('input');
  });

  it('handles cycles via visited set', () => {
    const elements = [
      makeElement({ tag: 'ComponentB', enclosingFunction: 'ComponentA' }),
      makeElement({ tag: 'ComponentA', enclosingFunction: 'ComponentB' }),
    ];
    const map = buildComponentMap(elements);
    const resolved = resolveComponent('ComponentA', map);
    // Should not infinite loop; ComponentA -> ComponentB -> ComponentA (visited, stop)
    expect(resolved).toHaveLength(0);
  });

  it('returns empty array for unknown component', () => {
    const map = new Map<string, ExtractedJSXElement[]>();
    const resolved = resolveComponent('Unknown', map);
    expect(resolved).toHaveLength(0);
  });

  it('respects maxDepth', () => {
    const elements = [
      makeElement({ tag: 'Level2', enclosingFunction: 'Level1' }),
      makeElement({ tag: 'Level3', enclosingFunction: 'Level2' }),
      makeElement({ tag: 'button', enclosingFunction: 'Level3' }),
    ];
    const map = buildComponentMap(elements);
    // maxDepth=2 means: Level1 -> Level2 -> Level3 (depth exhausted, can't go into Level3)
    const resolved = resolveComponent('Level1', map, 2);
    expect(resolved).toHaveLength(0);
  });
});

// --- resolveComponentsInFile ---
describe('resolveComponentsInFile', () => {
  it('adds resolved native elements alongside custom component usage', () => {
    const fileElements = [
      makeElement({ tag: 'FormField', filePath: 'page.tsx', lineNumber: 10, enclosingFunction: 'Page' }),
    ];
    const allElements = [
      ...fileElements,
      makeElement({ tag: 'input', enclosingFunction: 'FormField', filePath: 'form-field.tsx', lineNumber: 5 }),
      makeElement({ tag: 'label', enclosingFunction: 'FormField', filePath: 'form-field.tsx', lineNumber: 3 }),
    ];
    const map = buildComponentMap(allElements);
    const resolved = resolveComponentsInFile(fileElements, map);

    // Original FormField + 2 resolved native elements
    expect(resolved).toHaveLength(3);
    expect(resolved[0].tag).toBe('FormField');
    expect(resolved[1].tag).toBe('input');
    expect(resolved[1].filePath).toBe('page.tsx'); // attributed to usage site
    expect(resolved[1].lineNumber).toBe(10); // attributed to usage site
    expect(resolved[1].parentTag).toBe('FormField');
    expect(resolved[1].resolved).toBe(true); // marked as resolved
    expect(resolved[2].tag).toBe('label');
    expect(resolved[2].filePath).toBe('page.tsx');
    expect(resolved[2].resolved).toBe(true); // marked as resolved
  });

  it('keeps native elements unchanged', () => {
    const fileElements = [
      makeElement({ tag: 'div', filePath: 'page.tsx' }),
    ];
    const map = new Map<string, ExtractedJSXElement[]>();
    const resolved = resolveComponentsInFile(fileElements, map);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].tag).toBe('div');
  });

  it('merges usage-site props (id, aria-label) onto resolved native element', () => {
    const fileElements = [
      makeElement({
        tag: 'Input',
        filePath: 'page.tsx',
        lineNumber: 10,
        enclosingFunction: 'Page',
        attributes: new Map([['id', 'email'], ['aria-label', 'Email']]),
      }),
    ];
    const allElements = [
      ...fileElements,
      makeElement({
        tag: 'input',
        enclosingFunction: 'Input',
        filePath: 'input.tsx',
        lineNumber: 5,
        attributes: new Map([['type', 'text']]),
      }),
    ];
    const map = buildComponentMap(allElements);
    const resolved = resolveComponentsInFile(fileElements, map);

    // Original Input + resolved input
    expect(resolved).toHaveLength(2);
    const resolvedInput = resolved[1];
    expect(resolvedInput.tag).toBe('input');
    // Usage-site props should be merged
    expect(resolvedInput.attributes.get('id')).toBe('email');
    expect(resolvedInput.attributes.get('aria-label')).toBe('Email');
    // Internal props should be preserved
    expect(resolvedInput.attributes.get('type')).toBe('text');
  });

  it('does not merge className or children props to resolved element', () => {
    const fileElements = [
      makeElement({
        tag: 'Input',
        filePath: 'page.tsx',
        lineNumber: 10,
        enclosingFunction: 'Page',
        attributes: new Map([['className', 'w-full'], ['children', 'text'], ['id', 'name']]),
      }),
    ];
    const allElements = [
      ...fileElements,
      makeElement({
        tag: 'input',
        enclosingFunction: 'Input',
        filePath: 'input.tsx',
        lineNumber: 5,
        attributes: new Map(),
      }),
    ];
    const map = buildComponentMap(allElements);
    const resolved = resolveComponentsInFile(fileElements, map);
    const resolvedInput = resolved[1];
    // className and children should NOT be merged
    expect(resolvedInput.attributes.has('className')).toBe(false);
    expect(resolvedInput.attributes.has('children')).toBe(false);
    // id should be merged
    expect(resolvedInput.attributes.get('id')).toBe('name');
  });

  it('merges classNames arrays from both component internals and usage site', () => {
    const fileElements = [
      makeElement({
        tag: 'Input',
        filePath: 'page.tsx',
        lineNumber: 10,
        enclosingFunction: 'Page',
        classNames: ['w-full'],
      }),
    ];
    const allElements = [
      ...fileElements,
      makeElement({
        tag: 'input',
        enclosingFunction: 'Input',
        filePath: 'input.tsx',
        lineNumber: 5,
        classNames: ['border', 'rounded'],
      }),
    ];
    const map = buildComponentMap(allElements);
    const resolved = resolveComponentsInFile(fileElements, map);
    const resolvedInput = resolved[1];
    expect(resolvedInput.classNames).toEqual(['border', 'rounded', 'w-full']);
  });

  it('resolved Input with id + Label with htmlFor passes inputLabel rule', () => {
    // Integration-style test: component resolution + inputLabel rule
    const fileElements = [
      makeElement({
        tag: 'Input',
        filePath: 'page.tsx',
        lineNumber: 10,
        enclosingFunction: 'Page',
        attributes: new Map([['id', 'email']]),
      }),
    ];
    const allElements = [
      ...fileElements,
      makeElement({
        tag: 'input',
        enclosingFunction: 'Input',
        filePath: 'input.tsx',
        lineNumber: 5,
        attributes: new Map(),
      }),
    ];
    const map = buildComponentMap(allElements);
    const resolved = resolveComponentsInFile(fileElements, map);
    // Add a label that matches the id
    const label = makeElement({ tag: 'label', attributes: new Map([['htmlFor', 'email']]) });
    const allResolved = [label, ...resolved];
    const signals = inputLabel.check(allResolved, 'page.tsx');
    // The resolved input should pass because label htmlFor matches its id
    const inputSignals = signals.filter(s => s.element === 'input');
    expect(inputSignals).toHaveLength(1);
    expect(inputSignals[0].status).toBe('pass');
  });
});

// --- isKnownAccessibleComponent ---
describe('isKnownAccessibleComponent', () => {
  it('matches exact Radix component names', () => {
    expect(isKnownAccessibleComponent('Dialog')).toBe(true);
    expect(isKnownAccessibleComponent('DialogContent')).toBe(true);
    expect(isKnownAccessibleComponent('Select')).toBe(true);
    expect(isKnownAccessibleComponent('Checkbox')).toBe(true);
  });

  it('matches shadcn/ui component names', () => {
    expect(isKnownAccessibleComponent('Button')).toBe(true);
    expect(isKnownAccessibleComponent('Input')).toBe(true);
    expect(isKnownAccessibleComponent('FormField')).toBe(true);
    expect(isKnownAccessibleComponent('Label')).toBe(true);
  });

  it('matches dotted names like Dialog.Content', () => {
    expect(isKnownAccessibleComponent('Dialog.Content')).toBe(true);
    expect(isKnownAccessibleComponent('Select.Trigger')).toBe(true);
  });

  it('matches Radix Primitive component names', () => {
    expect(isKnownAccessibleComponent('AlertDialogPrimitive')).toBe(true);
    expect(isKnownAccessibleComponent('ToastPrimitive')).toBe(true);
    expect(isKnownAccessibleComponent('ToastViewport')).toBe(true);
    expect(isKnownAccessibleComponent('Toast')).toBe(true);
  });

  it('rejects unknown components', () => {
    expect(isKnownAccessibleComponent('MyCustomWidget')).toBe(false);
    expect(isKnownAccessibleComponent('UnknownComponent')).toBe(false);
  });

  it('rejects native elements', () => {
    expect(isKnownAccessibleComponent('div')).toBe(false);
    expect(isKnownAccessibleComponent('button')).toBe(false);
  });
});
