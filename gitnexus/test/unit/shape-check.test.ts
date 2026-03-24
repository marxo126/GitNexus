import { describe, it, expect } from 'vitest';
import { extractResponseShapes } from '../../src/core/ingestion/route-extractors/response-shapes.js';
import { extractConsumerAccessedKeys } from '../../src/core/ingestion/call-processor.js';

describe('extractResponseShapes', () => {
  it('extracts unquoted keys from .json() call', () => {
    const content = `return NextResponse.json({ data: [], pagination: {} });`;
    const result = extractResponseShapes(content);
    expect(result.responseKeys).toContain('data');
    expect(result.responseKeys).toContain('pagination');
  });

  it('extracts keys from .json() with quoted property names', () => {
    const content = `return NextResponse.json({ 'courses': coursesData, 'articles': articlesData });`;
    const result = extractResponseShapes(content);
    // Keys should not contain quotes regardless of source format
    expect(result.responseKeys).toBeDefined();
    if (result.responseKeys) {
      for (const key of result.responseKeys) {
        expect(key).not.toMatch(/['"]/);
      }
    }
  });

  it('classifies error keys by status code', () => {
    const content = `
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    `;
    const result = extractResponseShapes(content);
    expect(result.errorKeys).toContain('error');
    expect(result.responseKeys).toBeUndefined();
  });

  it('separates success and error keys from same handler', () => {
    const content = `
      if (bad) return NextResponse.json({ error: 'fail', details: 'x' }, { status: 400 });
      return NextResponse.json({ data: items, total: count });
    `;
    const result = extractResponseShapes(content);
    expect(result.responseKeys).toEqual(expect.arrayContaining(['data', 'total']));
    expect(result.errorKeys).toEqual(expect.arrayContaining(['error', 'details']));
  });
});

describe('extractConsumerAccessedKeys', () => {
  it('extracts destructured keys from .json()', () => {
    const content = `const { data, pagination } = await res.json();`;
    const keys = extractConsumerAccessedKeys(content);
    expect(keys).toContain('data');
    expect(keys).toContain('pagination');
  });

  it('extracts property access on response variables', () => {
    const content = `
      const result = await fetch('/api/test').then(r => r.json());
      console.log(data.items);
      console.log(data.total);
    `;
    const keys = extractConsumerAccessedKeys(content);
    expect(keys).toContain('items');
    expect(keys).toContain('total');
  });

  it('filters out common response methods', () => {
    const content = `
      const items = data.map(x => x.name);
      data.forEach(item => process(item));
      const len = data.length;
    `;
    const keys = extractConsumerAccessedKeys(content);
    expect(keys).not.toContain('map');
    expect(keys).not.toContain('forEach');
    expect(keys).not.toContain('length');
  });

  it('filters out DOM manipulation methods', () => {
    const content = `
      const { url } = await response.json();
      const link = document.createElement('a');
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    `;
    const keys = extractConsumerAccessedKeys(content);
    expect(keys).not.toContain('appendChild');
    expect(keys).not.toContain('removeChild');
    expect(keys).not.toContain('createElement');
    expect(keys).not.toContain('click');
  });

  it('still captures real response keys alongside DOM code', () => {
    const content = `
      const data = await res.json();
      const url = data.downloadUrl;
      const link = document.createElement('a');
      document.body.appendChild(link);
      document.body.removeChild(link);
    `;
    const keys = extractConsumerAccessedKeys(content);
    expect(keys).toContain('downloadUrl');
    expect(keys).not.toContain('appendChild');
    expect(keys).not.toContain('removeChild');
  });
});
