import { describe, it, expect } from 'vitest';
import { createParameterNodes, buildPassesToEdges } from '../../src/core/ingestion/parameter-processor.js';
import type { ExtractedParameter } from '../../src/core/ingestion/workers/parse-worker.js';

describe('parameter flow integration', () => {
  it('creates parameter nodes for all functions', () => {
    const params: ExtractedParameter[] = [
      { filePath: 'handler.ts', functionName: 'handlePOST', functionId: 'Function:handler.ts:handlePOST', paramName: 'request', paramIndex: 0, declaredType: 'NextRequest', isRest: false },
      { filePath: 'handler.ts', functionName: 'handlePOST', functionId: 'Function:handler.ts:handlePOST', paramName: 'context', paramIndex: 1, isRest: false },
      { filePath: 'handler.ts', functionName: 'pickAllowedFields', functionId: 'Function:handler.ts:pickAllowedFields', paramName: 'data', paramIndex: 0, declaredType: 'any', isRest: false },
      { filePath: 'handler.ts', functionName: 'pickAllowedFields', functionId: 'Function:handler.ts:pickAllowedFields', paramName: 'entity', paramIndex: 1, declaredType: 'string', isRest: false },
      { filePath: 'handler.ts', functionName: 'createGrant', functionId: 'Function:handler.ts:createGrant', paramName: 'data', paramIndex: 0, declaredType: 'any', isRest: false },
      { filePath: 'handler.ts', functionName: 'createGrant', functionId: 'Function:handler.ts:createGrant', paramName: 'slug', paramIndex: 1, declaredType: 'string', isRest: false },
    ];

    const nodes = createParameterNodes(params);
    expect(nodes).toHaveLength(6);

    // Verify each node has correct structure
    for (const node of nodes) {
      expect(node.id).toBeTruthy();
      expect(node.name).toBeTruthy();
      expect(node.filePath).toBe('handler.ts');
      expect(node.ownerId).toMatch(/^Function:handler\.ts:/);
    }
  });

  it('builds PASSES_TO edges matching call arguments to parameters', () => {
    const calls = [
      { sourceId: 'Function:handler.ts:handlePOST', targetId: 'Function:handler.ts:pickAllowedFields', argCount: 2 },
      { sourceId: 'Function:handler.ts:handlePOST', targetId: 'Function:handler.ts:createGrant', argCount: 2 },
    ];

    const paramMap = new Map([
      ['Function:handler.ts:pickAllowedFields', [
        { filePath: 'handler.ts', functionName: 'pickAllowedFields', functionId: 'Function:handler.ts:pickAllowedFields', paramName: 'data', paramIndex: 0, isRest: false },
        { filePath: 'handler.ts', functionName: 'pickAllowedFields', functionId: 'Function:handler.ts:pickAllowedFields', paramName: 'entity', paramIndex: 1, isRest: false },
      ] as ExtractedParameter[]],
      ['Function:handler.ts:createGrant', [
        { filePath: 'handler.ts', functionName: 'createGrant', functionId: 'Function:handler.ts:createGrant', paramName: 'data', paramIndex: 0, isRest: false },
        { filePath: 'handler.ts', functionName: 'createGrant', functionId: 'Function:handler.ts:createGrant', paramName: 'slug', paramIndex: 1, isRest: false },
      ] as ExtractedParameter[]],
    ]);

    const edges = buildPassesToEdges(calls, paramMap);
    // 2 params for pickAllowedFields + 2 params for createGrant = 4 edges
    expect(edges).toHaveLength(4);

    // Verify arg positions are correct
    const pickEdges = edges.filter(e => e.targetParamId.includes('pickAllowedFields'));
    expect(pickEdges).toHaveLength(2);
    expect(pickEdges.map(e => e.sourceParamIndex).sort()).toEqual([0, 1]);

    const grantEdges = edges.filter(e => e.targetParamId.includes('createGrant'));
    expect(grantEdges).toHaveLength(2);
    expect(grantEdges.map(e => e.sourceParamIndex).sort()).toEqual([0, 1]);

    // All edges should come from handlePOST
    for (const edge of edges) {
      expect(edge.callerId).toBe('Function:handler.ts:handlePOST');
      expect(edge.confidence).toBe(0.9);
    }
  });

  it('handles rest parameters in call matching', () => {
    const calls = [
      { sourceId: 'Function:handler.ts:handlePOST', targetId: 'Function:handler.ts:mergeAll', argCount: 3 },
    ];

    const paramMap = new Map([
      ['Function:handler.ts:mergeAll', [
        { filePath: 'handler.ts', functionName: 'mergeAll', functionId: 'Function:handler.ts:mergeAll', paramName: 'first', paramIndex: 0, isRest: false },
        { filePath: 'handler.ts', functionName: 'mergeAll', functionId: 'Function:handler.ts:mergeAll', paramName: 'rest', paramIndex: 1, isRest: true },
      ] as ExtractedParameter[]],
    ]);

    const edges = buildPassesToEdges(calls, paramMap);
    expect(edges).toHaveLength(2);
    // Both first (index 0) and rest (index 1) should have edges
    expect(edges.map(e => e.sourceParamIndex).sort()).toEqual([0, 1]);
  });

  it('handles partial argument passing (fewer args than params)', () => {
    const calls = [
      { sourceId: 'f:caller', targetId: 'f:target', argCount: 1 },
    ];

    const paramMap = new Map([
      ['f:target', [
        { filePath: 'a.ts', functionName: 'target', functionId: 'f:target', paramName: 'required', paramIndex: 0, isRest: false },
        { filePath: 'a.ts', functionName: 'target', functionId: 'f:target', paramName: 'optional', paramIndex: 1, isRest: false },
        { filePath: 'a.ts', functionName: 'target', functionId: 'f:target', paramName: 'alsoOptional', paramIndex: 2, isRest: false },
      ] as ExtractedParameter[]],
    ]);

    const edges = buildPassesToEdges(calls, paramMap);
    // Only 1 edge for the single argument passed
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceParamIndex).toBe(0);
  });
});
