import { describe, it, expect } from 'vitest';
import { isSourceAdjacent, isSinkAdjacent, getMatchingSinks } from '../../src/security/catalogs.js';
import { buildSourceSinkPaths } from '../../src/security/source-sink-scanner.js';

describe('source-sink integration', () => {
  it('detects fluentiagrant-style request-to-prisma path', () => {
    // Simulate fluentiagrant: handlePOST reads req.body, calls validate, calls prisma.create
    const handlePOST = `async function handlePOST(req) { const body = await req.json(); const validated = validate(body); return createGrant(validated); }`;
    const validate = `function validate(data) { return schema.parse(data); }`;
    const createGrant = `async function createGrant(data) { return prisma.grant.create({ data }); }`;

    expect(isSourceAdjacent('handlePOST', handlePOST)).toBe(true);
    expect(isSinkAdjacent('createGrant', createGrant)).toBe(true);
    expect(isSourceAdjacent('validate', validate)).toBe(false);
    expect(isSinkAdjacent('validate', validate)).toBe(false);

    const sources = [{ id: 'f:handlePOST', name: 'handlePOST', filePath: 'route.ts', sourcePatterns: ['req.json'] }];
    const sinks = [{ id: 'f:createGrant', name: 'createGrant', filePath: 'service.ts', sinkPatterns: ['prisma.'], owasp: 'A03-injection' }];
    const calls = new Map([
      ['f:handlePOST', ['f:validate']],
      ['f:validate', ['f:createGrant']],
    ]);

    const paths = buildSourceSinkPaths(sources, sinks, calls, 5);
    expect(paths).toHaveLength(1);
    expect(paths[0].depth).toBe(2);
    expect(paths[0].owasp).toBe('A03-injection');
    expect(paths[0].path).toEqual(['f:handlePOST', 'f:validate', 'f:createGrant']);
  });

  it('getMatchingSinks returns detailed info for reporting', () => {
    const content = `await prisma.grant.create({ data }); child_process.exec(cmd);`;
    const sinks = getMatchingSinks(content);
    expect(sinks.length).toBeGreaterThanOrEqual(2);
    expect(sinks.some(s => s.owasp === 'A03-injection')).toBe(true);
  });
});
