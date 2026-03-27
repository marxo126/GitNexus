import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES, getRelationships, getNodesByLabelFull,
  runPipelineFromRepo, type PipelineResult,
} from './helpers.js';

describe('shape_check integration', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'shape-check-integration'),
      () => {},
    );
  }, 60000);

  // --- Route & response shape extraction ---

  it('creates Route nodes with responseKeys', () => {
    const routes = getNodesByLabelFull(result, 'Route');
    const searchRoute = routes.find(r => r.name === '/api/search');
    expect(searchRoute).toBeDefined();
    expect(searchRoute!.properties.responseKeys).toBeDefined();
    expect(searchRoute!.properties.responseKeys.length).toBeGreaterThan(0);
  });

  it('extracts quoted property keys without wrapping quotes', () => {
    const routes = getNodesByLabelFull(result, 'Route');
    const searchRoute = routes.find(r => r.name === '/api/search');
    expect(searchRoute).toBeDefined();
    for (const key of searchRoute!.properties.responseKeys) {
      expect(key).not.toMatch(/['"]/);
    }
    expect(searchRoute!.properties.responseKeys).toContain('courses');
    expect(searchRoute!.properties.responseKeys).toContain('articles');
  });

  it('separates responseKeys from errorKeys by HTTP status', () => {
    const routes = getNodesByLabelFull(result, 'Route');
    const usersRoute = routes.find(r => r.name === '/api/users');
    expect(usersRoute).toBeDefined();
    expect(usersRoute!.properties.responseKeys).toEqual(
      expect.arrayContaining(['data']),
    );
    expect(usersRoute!.properties.errorKeys).toEqual(
      expect.arrayContaining(['error']),
    );
  });

  // --- Consumer key extraction ---

  it('creates FETCHES edges with accessedKeys in reason', () => {
    const edges = getRelationships(result, 'FETCHES');
    const searchFetch = edges.find(e =>
      e.sourceFilePath.includes('SearchBar') && e.target === '/api/search',
    );
    expect(searchFetch).toBeDefined();
    expect(searchFetch!.rel.reason).toContain('keys:');
    const keysStr = searchFetch!.rel.reason!.match(/keys:([^|]+)/)?.[1] ?? '';
    const keys = keysStr.split(',');
    expect(keys).toContain('courses');
    expect(keys).toContain('articles');
  });

  it('does not include DOM methods in consumer accessedKeys', () => {
    const edges = getRelationships(result, 'FETCHES');
    const gdprFetch = edges.find(e =>
      e.sourceFilePath.includes('GdprExport') && e.target === '/api/gdpr/export',
    );
    expect(gdprFetch).toBeDefined();
    const keysStr = gdprFetch!.rel.reason!.match(/keys:([^|]+)/)?.[1] ?? '';
    const keys = keysStr.split(',');
    expect(keys).not.toContain('appendChild');
    expect(keys).not.toContain('removeChild');
    expect(keys).not.toContain('createElement');
    expect(keys).not.toContain('click');
    expect(keys).toContain('url');
  });

  it('captures error-path key access from consumers', () => {
    const edges = getRelationships(result, 'FETCHES');
    const userFetch = edges.find(e =>
      e.sourceFilePath.includes('UserList') && e.target === '/api/users',
    );
    expect(userFetch).toBeDefined();
    const keysStr = userFetch!.rel.reason!.match(/keys:([^|]+)/)?.[1] ?? '';
    const keys = keysStr.split(',');
    expect(keys).toContain('data');
    expect(keys).toContain('error');
  });

  // --- Regression: DOM-like field names must not be blocklisted ---

  it('creates Route node for /api/links with DOM-like field names in responseKeys', () => {
    const routes = getNodesByLabelFull(result, 'Route');
    const linksRoute = routes.find(r => r.name === '/api/links');
    expect(linksRoute).toBeDefined();
    expect(linksRoute!.properties.responseKeys).toBeDefined();
    expect(linksRoute!.properties.responseKeys).toContain('type');
    expect(linksRoute!.properties.responseKeys).toContain('href');
    expect(linksRoute!.properties.responseKeys).toContain('target');
    expect(linksRoute!.properties.responseKeys).toContain('label');
  });

  it('consumer accessedKeys include DOM-like field names when accessing API data', () => {
    const edges = getRelationships(result, 'FETCHES');
    const linksFetch = edges.find(e =>
      e.sourceFilePath.includes('LinkList') && e.target === '/api/links',
    );
    expect(linksFetch).toBeDefined();
    const keysStr = linksFetch!.rel.reason!.match(/keys:([^|]+)/)?.[1] ?? '';
    const keys = keysStr.split(',');
    // These field names overlap with DOM properties but must NOT be filtered
    // by the blocklist when accessed on data variables (data.type, data.href, etc.)
    expect(keys).toContain('type');
    expect(keys).toContain('href');
    expect(keys).toContain('target');
    expect(keys).toContain('label');
  });
});
