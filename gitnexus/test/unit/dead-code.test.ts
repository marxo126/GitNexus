import { describe, it, expect } from 'vitest';
import { classifyDeadSymbols, type SymbolWithEdges } from '../../src/mcp/dead-code.js';

describe('classifyDeadSymbols', () => {
  const makeSymbol = (overrides: Partial<SymbolWithEdges>): SymbolWithEdges => ({
    id: 'test-id',
    name: 'testFn',
    label: 'Function',
    filePath: 'src/test.ts',
    startLine: 1,
    isExported: false,
    hasIncomingCalls: false,
    hasIncomingImports: false,
    isEntryPoint: false,
    isProcessParticipant: false,
    isRouteHandler: false,
    ...overrides,
  });

  it('classifies zero-caller non-entry-point as dead', () => {
    const symbols = [makeSymbol({ name: 'unused' })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('dead');
  });

  it('excludes symbols with incoming CALLS', () => {
    const symbols = [makeSymbol({ name: 'called', hasIncomingCalls: true })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(0);
  });

  it('excludes entry points', () => {
    const symbols = [makeSymbol({ name: 'entry', isEntryPoint: true })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(0);
  });

  it('excludes process participants', () => {
    const symbols = [makeSymbol({ name: 'inProcess', isProcessParticipant: true })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(0);
  });

  it('excludes route handlers', () => {
    const symbols = [makeSymbol({ name: 'handler', isRouteHandler: true })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(0);
  });

  it('classifies exported-but-never-imported as unused_export', () => {
    const symbols = [makeSymbol({ name: 'exported', isExported: true, hasIncomingImports: false })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('unused_export');
  });

  it('excludes symbols with incoming IMPORTS', () => {
    const symbols = [makeSymbol({ name: 'imported', isExported: true, hasIncomingImports: true })];
    const result = classifyDeadSymbols(symbols);
    expect(result).toHaveLength(0);
  });

  it('groups results by file and sorts by filePath', () => {
    const symbols = [
      makeSymbol({ name: 'b', filePath: 'src/z.ts', startLine: 10 }),
      makeSymbol({ name: 'a', filePath: 'src/a.ts', startLine: 5 }),
    ];
    const result = classifyDeadSymbols(symbols);
    expect(result[0].filePath).toBe('src/a.ts');
    expect(result[1].filePath).toBe('src/z.ts');
  });
});
