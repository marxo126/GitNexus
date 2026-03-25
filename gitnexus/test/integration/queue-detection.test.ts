import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';
import type { PipelineResult } from '../../types/pipeline.js';
const QUEUE_REPO = path.resolve(__dirname, '..', 'fixtures', 'queue-repo');
describe('Queue Detection', () => {
  let result: PipelineResult;
  beforeAll(async () => { result = await runPipelineFromRepo(QUEUE_REPO, () => {}); }, 60_000);
  it('ENQUEUES edges', () => { expect(result.graph.relationships.filter(r => r.type === 'ENQUEUES').length).toBeGreaterThanOrEqual(1); });
  it('PROCESSES edges', () => { expect(result.graph.relationships.filter(r => r.type === 'PROCESSES').length).toBeGreaterThanOrEqual(1); });
  it('queue nodes', () => { expect(result.graph.nodes.filter(n => n.label === 'CodeElement' && n.properties?.description?.startsWith('Queue:')).length).toBeGreaterThanOrEqual(1); });
});
