/**
 * Integration Test: dead_code fixture graph verification
 *
 * Runs the full pipeline on the dead-code fixture and verifies
 * the graph has correct nodes and edges for dead code classification.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';
import { classifyDeadSymbols, type SymbolWithEdges } from '../../src/mcp/dead-code.js';
import { isTestFilePath } from '../../src/mcp/local/local-backend.js';
import type { PipelineResult } from '../../src/types/pipeline.js';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'dead-code');

describe('dead_code graph verification', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(FIXTURE, () => {});
  }, 60000);

  it('fixture produces callable symbol nodes', () => {
    const callableNames: string[] = [];
    result.graph.forEachNode(n => {
      if (['Function', 'Method', 'Class', 'Constructor'].includes(n.label)) {
        callableNames.push(n.properties.name);
      }
    });
    // Dead functions
    expect(callableNames).toContain('unusedHelper');
    expect(callableNames).toContain('deprecatedFormat');
    // Alive functions
    expect(callableNames).toContain('main');
    expect(callableNames).toContain('handleRequest');
    expect(callableNames).toContain('validateInput');
    expect(callableNames).toContain('formatOutput');
  });

  it('CALLS edges exist for alive functions', () => {
    const callTargets = new Set<string>();
    for (const rel of result.graph.iterRelationships()) {
      if (rel.type === 'CALLS') {
        const target = result.graph.getNode(rel.targetId);
        if (target) callTargets.add(target.properties.name);
      }
    }
    expect(callTargets).toContain('handleRequest');
    expect(callTargets).toContain('validateInput');
    expect(callTargets).toContain('formatOutput');
  });

  it('dead functions have no incoming CALLS edges', () => {
    const callTargetIds = new Set<string>();
    for (const rel of result.graph.iterRelationships()) {
      if (rel.type === 'CALLS') callTargetIds.add(rel.targetId);
    }

    result.graph.forEachNode(n => {
      if (n.properties.name === 'unusedHelper' || n.properties.name === 'deprecatedFormat') {
        expect(callTargetIds).not.toContain(n.id);
      }
    });
  });

  it('classifyDeadSymbols correctly classifies graph-derived data', () => {
    // Build SymbolWithEdges from the actual graph
    const callTargetIds = new Set<string>();
    const importTargetIds = new Set<string>();
    const entryPointIds = new Set<string>();
    const processIds = new Set<string>();
    const routeHandlerIds = new Set<string>();

    for (const rel of result.graph.iterRelationships()) {
      if (rel.type === 'CALLS') callTargetIds.add(rel.targetId);
      if (rel.type === 'IMPORTS') importTargetIds.add(rel.targetId);
      if (rel.type === 'ENTRY_POINT_OF') entryPointIds.add(rel.sourceId);
      if (rel.type === 'STEP_IN_PROCESS') processIds.add(rel.sourceId);
      if (rel.type === 'HANDLES_ROUTE') routeHandlerIds.add(rel.sourceId);
    }

    const symbols: SymbolWithEdges[] = [];
    result.graph.forEachNode(n => {
      if (!['Function', 'Method', 'Class', 'Constructor'].includes(n.label)) return;
      if (isTestFilePath(n.properties.filePath || '')) return;
      symbols.push({
        id: n.id,
        name: n.properties.name,
        label: n.label,
        filePath: n.properties.filePath || '',
        startLine: n.properties.startLine || 0,
        isExported: n.properties.isExported || false,
        hasIncomingCalls: callTargetIds.has(n.id),
        hasIncomingImports: importTargetIds.has(n.id),
        isEntryPoint: entryPointIds.has(n.id),
        isProcessParticipant: processIds.has(n.id),
        isRouteHandler: routeHandlerIds.has(n.id),
      });
    });

    const dead = classifyDeadSymbols(symbols);
    const deadNames = dead.map(d => d.name);

    // Dead functions should be detected
    expect(deadNames).toContain('unusedHelper');
    expect(deadNames).toContain('deprecatedFormat');
    expect(deadNames).toContain('internalDead');

    // Alive functions should NOT be detected
    expect(deadNames).not.toContain('main');
    expect(deadNames).not.toContain('handleRequest');
    expect(deadNames).not.toContain('validateInput');
    expect(deadNames).not.toContain('formatOutput');

    // Unused exports
    const unusedExports = dead.filter(d => d.tag === 'unused_export').map(d => d.name);
    expect(unusedExports).toContain('neverImported');
    expect(unusedExports).toContain('alsoNeverImported');
    expect(unusedExports).not.toContain('formatOutput');
  });
});
