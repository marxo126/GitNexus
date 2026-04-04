/**
 * End-to-end Integration Tests: Webhook/Event Handler Detection
 *
 * Proves the full chain requested in PR #512 review:
 *   1. Webhook detection — extractWebhooks correctly identifies Stripe, edge-function,
 *      and realtime patterns from fixture source files
 *   2. Persistence — eventTypes survive LadybugDB round-trip via Cypher CREATE + query
 *   3. webhook_map readback — tool queries return correct data with filtering
 *
 * Part A: Detection logic against test/fixtures/webhook-repo/ file contents
 * Part B: Seed-based LadybugDB persistence + webhook_map tool dispatch
 *
 * NOTE: Part A tests extractWebhooks directly against fixture files for fast,
 * isolated validation. The pipeline calls extractWebhooks in both the worker
 * path AND the sequential fallback path (for repos with <15 files / <512KB).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { listRegisteredRepos } from '../../src/storage/repo-manager.js';
import { withTestLbugDB } from '../helpers/test-indexed-db.js';
import {
  extractWebhooks,
  type ExtractedWebhook,
} from '../../src/core/ingestion/workers/parse-worker.js';

vi.mock('../../src/storage/repo-manager.js', () => ({
  listRegisteredRepos: vi.fn().mockResolvedValue([]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
}));

const WEBHOOK_REPO = path.resolve(__dirname, '..', 'fixtures', 'webhook-repo');

// ─── Part A: extractWebhooks detection logic against fixture files ────

describe('webhook detection — extraction from fixture files', () => {
  const stripeContent = fs.readFileSync(
    path.join(WEBHOOK_REPO, 'app/api/stripe/webhooks/route.ts'),
    'utf-8',
  );
  const edgeFnContent = fs.readFileSync(
    path.join(WEBHOOK_REPO, 'supabase/functions/notify/index.ts'),
    'utf-8',
  );
  const realtimeContent = fs.readFileSync(path.join(WEBHOOK_REPO, 'lib/realtime.ts'), 'utf-8');

  it('detects Stripe webhook with correct kind and eventTypes', () => {
    const out: ExtractedWebhook[] = [];
    extractWebhooks('app/api/stripe/webhooks/route.ts', stripeContent, out);

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('stripe');
    expect(out[0].name).toBe('stripe-webhook');
    expect(out[0].eventTypes).toContain('checkout.session.completed');
    expect(out[0].eventTypes).toContain('invoice.payment_failed');
    expect(out[0].eventTypes).toHaveLength(2);
  });

  it('detects Supabase Edge Function with correct kind and name', () => {
    const out: ExtractedWebhook[] = [];
    extractWebhooks('supabase/functions/notify/index.ts', edgeFnContent, out);

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('edge-function');
    expect(out[0].name).toBe('notify');
    expect(out[0].eventTypes).toEqual([]);
  });

  it('detects Supabase Realtime subscription with correct kind and channel name', () => {
    const out: ExtractedWebhook[] = [];
    extractWebhooks('lib/realtime.ts', realtimeContent, out);

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('realtime');
    expect(out[0].name).toBe('realtime:order-updates');
    expect(out[0].eventTypes).toEqual([]);
  });

  it('skips test files containing webhook patterns', () => {
    const out: ExtractedWebhook[] = [];
    extractWebhooks('test/webhooks.test.ts', stripeContent, out);
    expect(out).toHaveLength(0);

    extractWebhooks('__test/stripe.ts', stripeContent, out);
    expect(out).toHaveLength(0);
  });
});

// ─── Part B: Persistence + webhook_map readback via LadybugDB ────────

const WEBHOOK_SEED_DATA = [
  // File nodes (sources of TRIGGERS edges)
  `CREATE (f:File {id: 'File:app/api/stripe/webhooks/route.ts', name: 'route.ts', filePath: 'app/api/stripe/webhooks/route.ts', content: ''})`,
  `CREATE (f:File {id: 'File:supabase/functions/notify/index.ts', name: 'index.ts', filePath: 'supabase/functions/notify/index.ts', content: ''})`,
  `CREATE (f:File {id: 'File:lib/realtime.ts', name: 'realtime.ts', filePath: 'lib/realtime.ts', content: ''})`,

  // Webhook nodes — mirrors what the pipeline produces
  `CREATE (w:Webhook {id: 'Webhook:stripe-webhook', name: 'stripe-webhook', filePath: 'app/api/stripe/webhooks/route.ts', kind: 'stripe', eventTypes: ['checkout.session.completed', 'invoice.payment_failed']})`,
  `CREATE (w:Webhook {id: 'Webhook:notify', name: 'notify', filePath: 'supabase/functions/notify/index.ts', kind: 'edge-function', eventTypes: []})`,
  `CREATE (w:Webhook {id: 'Webhook:realtime:order-updates', name: 'realtime:order-updates', filePath: 'lib/realtime.ts', kind: 'realtime', eventTypes: []})`,

  // TRIGGERS edges: File -> Webhook
  `MATCH (f:File), (w:Webhook) WHERE f.id = 'File:app/api/stripe/webhooks/route.ts' AND w.id = 'Webhook:stripe-webhook'
   CREATE (f)-[:CodeRelation {type: 'TRIGGERS', confidence: 1.0, reason: 'webhook-handler:stripe', step: 0}]->(w)`,
  `MATCH (f:File), (w:Webhook) WHERE f.id = 'File:supabase/functions/notify/index.ts' AND w.id = 'Webhook:notify'
   CREATE (f)-[:CodeRelation {type: 'TRIGGERS', confidence: 1.0, reason: 'webhook-handler:edge-function', step: 0}]->(w)`,
  `MATCH (f:File), (w:Webhook) WHERE f.id = 'File:lib/realtime.ts' AND w.id = 'Webhook:realtime:order-updates'
   CREATE (f)-[:CodeRelation {type: 'TRIGGERS', confidence: 1.0, reason: 'webhook-handler:realtime', step: 0}]->(w)`,
];

withTestLbugDB(
  'webhook-persistence',
  (handle) => {
    describe('eventTypes survive LadybugDB round-trip', () => {
      it('Stripe webhook eventTypes array is persisted and queryable', async () => {
        const { executeParameterized } = await import('../../src/mcp/core/lbug-adapter.js');
        const rows = await executeParameterized(
          handle.repoId,
          `
        MATCH (w:Webhook)
        WHERE w.kind = $kind
        RETURN w.name AS name, w.eventTypes AS eventTypes
      `,
          { kind: 'stripe' },
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('stripe-webhook');
        expect(rows[0].eventTypes).toContain('checkout.session.completed');
        expect(rows[0].eventTypes).toContain('invoice.payment_failed');
      });

      it('edge-function and realtime webhooks persist with empty eventTypes', async () => {
        const { executeParameterized } = await import('../../src/mcp/core/lbug-adapter.js');
        const rows = await executeParameterized(
          handle.repoId,
          `
        MATCH (w:Webhook)
        WHERE w.kind = $kind
        RETURN w.name AS name, w.eventTypes AS eventTypes
      `,
          { kind: 'edge-function' },
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('notify');
        expect(rows[0].eventTypes).toEqual([]);
      });

      it('all 3 webhook nodes survive persistence', async () => {
        const { executeParameterized } = await import('../../src/mcp/core/lbug-adapter.js');
        const rows = await executeParameterized(
          handle.repoId,
          `
        MATCH (w:Webhook)
        WHERE w.id STARTS WITH 'Webhook:'
        RETURN w.id AS id, w.kind AS kind
        ORDER BY w.kind
      `,
          {},
        );

        expect(rows).toHaveLength(3);
        const kinds = rows.map((r: any) => r.kind);
        expect(kinds).toContain('stripe');
        expect(kinds).toContain('edge-function');
        expect(kinds).toContain('realtime');
      });

      it('TRIGGERS edges survive persistence', async () => {
        const { executeParameterized } = await import('../../src/mcp/core/lbug-adapter.js');
        const rows = await executeParameterized(
          handle.repoId,
          `
        MATCH (f:File)-[r:CodeRelation {type: 'TRIGGERS'}]->(w:Webhook)
        RETURN f.filePath AS filePath, w.name AS webhookName
        ORDER BY w.name
      `,
          {},
        );

        expect(rows).toHaveLength(3);
        const names = rows.map((r: any) => r.webhookName);
        expect(names).toContain('stripe-webhook');
        expect(names).toContain('notify');
        expect(names).toContain('realtime:order-updates');
      });
    });

    describe('webhook_map tool reads back persisted data', () => {
      let backend: LocalBackend;

      beforeAll(async () => {
        const ext = handle as typeof handle & { _backend?: LocalBackend };
        if (!ext._backend) {
          throw new Error(
            'LocalBackend not initialized — afterSetup did not attach _backend to handle',
          );
        }
        backend = ext._backend;
        // Trigger ensureInitialized via a cypher call — webhookMap doesn't call
        // ensureInitialized itself, so the pool adapter must be warmed up first.
        await backend.callTool('cypher', { query: 'MATCH (n:Webhook) RETURN count(n) AS c' });
      });

      it('returns all 3 webhooks with correct structure', async () => {
        const result = await backend.callTool('webhook_map', {});
        expect(result).not.toHaveProperty('error');
        expect(result.total).toBe(3);
        expect(result.webhooks).toHaveLength(3);

        const stripe = result.webhooks.find((w: any) => w.kind === 'stripe');
        expect(stripe).toBeDefined();
        expect(stripe.name).toBe('stripe-webhook');
        expect(stripe.eventTypes).toContain('checkout.session.completed');
        expect(stripe.eventTypes).toContain('invoice.payment_failed');

        const edgeFn = result.webhooks.find((w: any) => w.kind === 'edge-function');
        expect(edgeFn).toBeDefined();
        expect(edgeFn.name).toBe('notify');

        const realtime = result.webhooks.find((w: any) => w.kind === 'realtime');
        expect(realtime).toBeDefined();
        expect(realtime.name).toContain('order-updates');
      });

      it('filters by kind parameter', async () => {
        const result = await backend.callTool('webhook_map', { kind: 'stripe' });
        expect(result.total).toBe(1);
        expect(result.webhooks[0].kind).toBe('stripe');
        expect(result.webhooks[0].eventTypes).toContain('checkout.session.completed');
      });

      it('filters by name parameter', async () => {
        const result = await backend.callTool('webhook_map', { name: 'notify' });
        expect(result.total).toBe(1);
        expect(result.webhooks[0].name).toBe('notify');
        expect(result.webhooks[0].kind).toBe('edge-function');
      });
    });
  },
  {
    seed: WEBHOOK_SEED_DATA,
    poolAdapter: true,
    afterSetup: async (handle) => {
      vi.mocked(listRegisteredRepos).mockResolvedValue([
        {
          name: 'webhook-test-repo',
          path: '/test/webhook-repo',
          storagePath: handle.tmpHandle.dbPath,
          indexedAt: new Date().toISOString(),
          lastCommit: 'webhook123',
          stats: { files: 3, nodes: 6, communities: 0, processes: 0 },
        },
      ]);

      const backend = new LocalBackend();
      await backend.init();
      (handle as any)._backend = backend;
    },
  },
);
