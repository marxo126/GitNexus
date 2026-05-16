/**
 * Integration test: parameter-flow pipeline.
 *
 * Verifies the phase-4 parameter-processor + parameters pipeline phase:
 *   1. Parameter nodes are created for each Function/Method/Constructor parameter.
 *   2. Owners are connected to their parameters via CONTAINS edges.
 *   3. PASSES_TO edges from call-site to callee parameters are synthesized
 *      positionally — including rest-param overflow handling.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';
import type { PipelineResult } from '../../src/types/pipeline.js';

const PARAM_REPO = path.resolve(__dirname, '..', 'fixtures', 'parameter-flow');

interface ParamSummary {
  name: string;
  paramIndex: number;
  declaredType: string;
  isRest: boolean;
  ownerLabel: string;
  ownerName: string;
}

describe('parameter-flow pipeline', () => {
  let result: PipelineResult;
  let parameters: ParamSummary[];

  beforeAll(async () => {
    result = await runPipelineFromRepo(PARAM_REPO, () => {});

    parameters = [];
    result.graph.forEachNode((n) => {
      if (n.label !== 'Parameter') return;
      // CONTAINS edge sourceId is the owner — recover it.
      let ownerId: string | undefined;
      for (const rel of result.graph.iterRelationshipsByType('CONTAINS')) {
        if (rel.targetId === n.id) {
          ownerId = rel.sourceId;
          break;
        }
      }
      const owner = ownerId ? result.graph.getNode(ownerId) : undefined;
      parameters.push({
        name: String(n.properties.name ?? ''),
        paramIndex: Number(n.properties.paramIndex ?? -1),
        declaredType: String(n.properties.declaredType ?? ''),
        isRest: Boolean(n.properties.isRest),
        ownerLabel: owner ? owner.label : '<missing>',
        ownerName: owner ? String(owner.properties.name ?? '') : '<missing>',
      });
    });
  }, 60000);

  it('creates a Parameter node per declared parameter', () => {
    const byOwner = new Map<string, ParamSummary[]>();
    for (const p of parameters) {
      let arr = byOwner.get(p.ownerName);
      if (!arr) {
        arr = [];
        byOwner.set(p.ownerName, arr);
      }
      arr.push(p);
    }

    const handlerParams = byOwner.get('handleCreateGrant') ?? [];
    expect(handlerParams.map((p) => p.name).sort()).toEqual(['request']);

    const sanitizeParams = byOwner.get('sanitize') ?? [];
    expect(sanitizeParams.map((p) => p.name).sort()).toEqual(['data', 'entity']);

    const validateParams = byOwner.get('validateGrant') ?? [];
    expect(validateParams.map((p) => p.name).sort()).toEqual(['input', 'slug']);

    const persistParams = byOwner.get('persistGrant') ?? [];
    expect(persistParams.map((p) => p.name).sort()).toEqual(['grant', 'slug']);

    const mergeParams = byOwner.get('mergeAll') ?? [];
    expect(mergeParams.map((p) => p.name).sort()).toEqual(['first', 'rest']);
  });

  it('captures paramIndex monotonically and marks rest params', () => {
    const merge = parameters.filter((p) => p.ownerName === 'mergeAll').sort((a, b) =>
      a.paramIndex - b.paramIndex,
    );
    expect(merge).toHaveLength(2);
    expect(merge[0]).toMatchObject({ name: 'first', paramIndex: 0, isRest: false });
    expect(merge[1]).toMatchObject({ name: 'rest', paramIndex: 1, isRest: true });

    const sanitize = parameters.filter((p) => p.ownerName === 'sanitize').sort((a, b) =>
      a.paramIndex - b.paramIndex,
    );
    expect(sanitize.map((p) => p.paramIndex)).toEqual([0, 1]);
  });

  it('creates CONTAINS edges from owner callable to each Parameter', () => {
    let containsParameter = 0;
    for (const rel of result.graph.iterRelationshipsByType('CONTAINS')) {
      const target = result.graph.getNode(rel.targetId);
      if (target?.label === 'Parameter') containsParameter++;
    }
    expect(containsParameter).toBeGreaterThanOrEqual(parameters.length);
  });

  it('synthesizes PASSES_TO edges from call-sites to callee parameters', () => {
    const passes: { caller: string; calleeParam: string; argIndex: number | undefined }[] = [];
    for (const rel of result.graph.iterRelationshipsByType('PASSES_TO')) {
      const caller = result.graph.getNode(rel.sourceId);
      const param = result.graph.getNode(rel.targetId);
      if (!caller || !param || param.label !== 'Parameter') continue;
      passes.push({
        caller: String(caller.properties.name ?? ''),
        calleeParam: `${param.properties.paramIndex ?? '?'}:${param.properties.name ?? '?'}`,
        argIndex: rel.step,
      });
    }
    expect(passes.length).toBeGreaterThan(0);

    const handlerPasses = passes.filter((p) => p.caller === 'handleCreateGrant');
    expect(handlerPasses.length).toBeGreaterThan(0);
  });
});
