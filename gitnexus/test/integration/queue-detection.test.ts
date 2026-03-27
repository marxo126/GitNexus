import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

const QUEUE_REPO = path.resolve(__dirname, '..', 'fixtures', 'queue-repo');

describe('Queue Detection', () => {
  let graph: any;

  beforeAll(async () => {
    const result = await runPipelineFromRepo(QUEUE_REPO, () => {});
    graph = result.graph;
  }, 60_000);

  it('creates ENQUEUES edges for BullMQ producers and Temporal starters', () => {
    const enqueues: any[] = [];
    graph.forEachRelationship((r: any) => { if (r.type === 'ENQUEUES') enqueues.push(r); });
    expect(enqueues.length).toBeGreaterThanOrEqual(1);
  });

  it('creates PROCESSES edges for BullMQ consumers', () => {
    const processes: any[] = [];
    graph.forEachRelationship((r: any) => { if (r.type === 'PROCESSES') processes.push(r); });
    expect(processes.length).toBeGreaterThanOrEqual(1);
  });

  it('creates CodeElement queue nodes', () => {
    const queueNodes: any[] = [];
    graph.forEachNode((n: any) => {
      if (n.label === 'CodeElement' && n.properties?.description?.startsWith('Queue:')) {
        queueNodes.push(n);
      }
    });
    expect(queueNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts actual taskQueue name from Temporal workflow.start', () => {
    const queueNodes: any[] = [];
    graph.forEachNode((n: any) => {
      if (n.label === 'CodeElement' && n.properties?.description?.startsWith('Queue:')) {
        queueNodes.push(n);
      }
    });
    const queueNames = queueNodes.map((n: any) => n.properties.name);
    // starter.ts has taskQueue: 'orders' -- should use that, not the workflow function name
    expect(queueNames).toContain('orders');
  });

  it('detects colon-namespaced BullMQ queue names', () => {
    const queueNodes: any[] = [];
    graph.forEachNode((n: any) => {
      if (n.label === 'CodeElement' && n.properties?.description?.startsWith('Queue:')) {
        queueNodes.push(n);
      }
    });
    const queueNames = queueNodes.map((n: any) => n.properties.name);
    expect(queueNames).toContain('payments:high-priority');
  });

  it('creates ENQUEUES edge for colon-namespaced producer', () => {
    const enqueues: any[] = [];
    graph.forEachRelationship((r: any) => { if (r.type === 'ENQUEUES') enqueues.push(r); });
    // The target node of the ENQUEUES edge should be the colon-namespaced queue
    const targetNames = enqueues.map((r: any) => {
      const target = graph.getNode(r.targetId);
      return target?.properties?.name;
    });
    expect(targetNames).toContain('payments:high-priority');
  });

  it('creates PROCESSES edge for colon-namespaced consumer', () => {
    const processes: any[] = [];
    graph.forEachRelationship((r: any) => { if (r.type === 'PROCESSES') processes.push(r); });
    const targetNames = processes.map((r: any) => {
      const target = graph.getNode(r.targetId);
      return target?.properties?.name;
    });
    expect(targetNames).toContain('payments:high-priority');
  });

  it('uses proxyActivities guard for Temporal activity detection', () => {
    // workflow.ts has proxyActivities + activities.validateOrder etc.
    // These should create ENQUEUES edges (producer role, not 'activity' role)
    const enqueues: any[] = [];
    graph.forEachRelationship((r: any) => { if (r.type === 'ENQUEUES') enqueues.push(r); });
    const reasons = enqueues.map((r: any) => r.reason);
    // Activity calls should have producer in reason
    expect(reasons.some((r: string) => r.includes('producer'))).toBe(true);
  });
});
