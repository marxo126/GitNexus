import { describe, it, expect } from 'vitest';
import { extractJSXElements } from '../../src/core/ingestion/a11y-rules/jsx-extractor.js';

describe('extractJSXElements', () => {
  const FILE = 'components/Test.tsx';

  it('extracts img self-closing with alt attribute', () => {
    const source = `
const Hero = () => (
  <img src="/hero.png" alt="Hero banner" />
);`;
    const elements = extractJSXElements(source, FILE);
    const img = elements.find((e) => e.tag === 'img');
    expect(img).toBeDefined();
    expect(img!.tag).toBe('img');
    expect(img!.attributes.get('alt')).toBe('Hero banner');
    expect(img!.attributes.get('src')).toBe('/hero.png');
    expect(img!.filePath).toBe(FILE);
    expect(img!.lineNumber).toBeGreaterThan(0);
  });

  it('extracts button with onClick and children text', () => {
    const source = `
function SubmitBtn() {
  return <button onClick={handleSubmit} type="submit">Submit</button>;
}`;
    const elements = extractJSXElements(source, FILE);
    const btn = elements.find((e) => e.tag === 'button');
    expect(btn).toBeDefined();
    expect(btn!.attributes.get('onClick')).toBe('handleSubmit');
    expect(btn!.attributes.get('type')).toBe('submit');
    expect(btn!.hasChildren).toBe(true);
    expect(btn!.textContent).toBe('Submit');
  });

  it('extracts div with className and parses into classNames array', () => {
    const source = `
const Card = () => <div className="card flex p-4">Content</div>;`;
    const elements = extractJSXElements(source, FILE);
    const div = elements.find((e) => e.tag === 'div');
    expect(div).toBeDefined();
    expect(div!.classNames).toEqual(['card', 'flex', 'p-4']);
  });

  it('extracts element with aria-label', () => {
    const source = `
const Nav = () => <nav aria-label="Main navigation">Links</nav>;`;
    const elements = extractJSXElements(source, FILE);
    const nav = elements.find((e) => e.tag === 'nav');
    expect(nav).toBeDefined();
    expect(nav!.attributes.get('aria-label')).toBe('Main navigation');
  });

  it('extracts multiple elements from same source', () => {
    const source = `
const Page = () => (
  <div>
    <h1>Title</h1>
    <img src="/logo.png" alt="Logo" />
    <button>Click</button>
  </div>
);`;
    const elements = extractJSXElements(source, FILE);
    const tags = elements.map((e) => e.tag);
    expect(tags).toContain('div');
    expect(tags).toContain('h1');
    expect(tags).toContain('img');
    expect(tags).toContain('button');
    expect(elements.length).toBeGreaterThanOrEqual(4);
  });

  it('handles elements without attributes', () => {
    const source = `const App = () => <div>Hello</div>;`;
    const elements = extractJSXElements(source, FILE);
    const div = elements.find((e) => e.tag === 'div');
    expect(div).toBeDefined();
    expect(div!.attributes.size).toBe(0);
    expect(div!.hasChildren).toBe(true);
    expect(div!.textContent).toBe('Hello');
  });

  it('skips non-JSX content', () => {
    const source = `
const x = 5;
const y = x + 10;
function add(a: number, b: number) { return a + b; }
`;
    const elements = extractJSXElements(source, FILE);
    expect(elements).toEqual([]);
  });

  it('detects enclosing function name', () => {
    const source = `
function MyComponent() {
  return <img alt="test" />;
}`;
    const elements = extractJSXElements(source, FILE);
    const img = elements.find((e) => e.tag === 'img');
    expect(img).toBeDefined();
    expect(img!.enclosingFunction).toBe('MyComponent');
  });

  it('detects arrow function enclosing name', () => {
    const source = `
const MyWidget = () => {
  return <span>text</span>;
};`;
    const elements = extractJSXElements(source, FILE);
    const span = elements.find((e) => e.tag === 'span');
    expect(span).toBeDefined();
    expect(span!.enclosingFunction).toBe('MyWidget');
  });

  it('handles boolean attributes', () => {
    const source = `const Form = () => <input disabled required type="text" />;`;
    const elements = extractJSXElements(source, FILE);
    const input = elements.find((e) => e.tag === 'input');
    expect(input).toBeDefined();
    expect(input!.attributes.get('disabled')).toBe(true);
    expect(input!.attributes.get('required')).toBe(true);
    expect(input!.attributes.get('type')).toBe('text');
  });

  it('detects self-closing element has no children', () => {
    const source = `const X = () => <br />;`;
    const elements = extractJSXElements(source, FILE);
    const br = elements.find((e) => e.tag === 'br');
    expect(br).toBeDefined();
    expect(br!.hasChildren).toBe(false);
  });
});
