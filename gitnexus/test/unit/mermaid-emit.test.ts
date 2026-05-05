/**
 * Unit tests for mermaid-emit.ts
 *
 * Covers: escapeLabel, aliasParticipant, emitSequenceDiagram, emitFlowchart
 */

import { describe, it, expect } from 'vitest';
import {
  escapeLabel,
  aliasParticipant,
  emitSequenceDiagram,
  emitFlowchart,
} from '../../src/core/diagram/mermaid-emit.js';

// ─── escapeLabel ──────────────────────────────────────────────────────────────

describe('escapeLabel', () => {
  it('passes through plain text unchanged', () => {
    expect(escapeLabel('plaintext')).toBe('plaintext');
    expect(escapeLabel('getUserById')).toBe('getUserById');
  });

  it('wraps labels containing () in double quotes', () => {
    const result = escapeLabel('validate()');
    expect(result).toBe('"validate()"');
  });

  it('wraps labels containing . in double quotes', () => {
    const result = escapeLabel('user.name');
    expect(result).toBe('"user.name"');
  });

  it('wraps labels containing : in double quotes', () => {
    const result = escapeLabel('GET: /api/users');
    expect(result).toBe('"GET: /api/users"');
  });

  it('wraps labels containing - in double quotes', () => {
    const result = escapeLabel('some-label');
    expect(result).toBe('"some-label"');
  });

  it('replaces ; with #59; and wraps in quotes', () => {
    const result = escapeLabel('a;b');
    // ; triggers quote AND replacement
    expect(result).toContain('#59;');
    expect(result.startsWith('"')).toBe(true);
  });

  it('replaces # with #35;', () => {
    const result = escapeLabel('color#red');
    expect(result).toContain('#35;');
  });

  it('wraps the reserved token `end` in double quotes', () => {
    expect(escapeLabel('end')).toBe('"end"');
  });

  it('does NOT wrap non-reserved plain words', () => {
    expect(escapeLabel('ending')).toBe('ending');
    expect(escapeLabel('render')).toBe('render');
  });

  it('preserves \\n inside quoted labels', () => {
    const result = escapeLabel('line1\nline2.');
    // Contains . so will be quoted; \n should survive inside quotes
    expect(result).toContain('\n');
    expect(result.startsWith('"')).toBe(true);
  });
});

// ─── aliasParticipant ─────────────────────────────────────────────────────────

describe('aliasParticipant', () => {
  it('returns name as alias when short enough', () => {
    const result = aliasParticipant('AuthService');
    expect(result.alias).toBe('AuthService');
    expect(result.full).toBe('AuthService');
  });

  it('generates initials alias for long names', () => {
    const result = aliasParticipant('ServiceMetadataProvider', 20);
    expect(result.alias).not.toBe('ServiceMetadataProvider');
    expect(result.full).toBe('ServiceMetadataProvider');
    // Alias should be short
    expect(result.alias.length).toBeLessThan(20);
  });

  it('alias and full are both set for short name', () => {
    const result = aliasParticipant('Auth', 20);
    expect(result.alias).toBe('Auth');
    expect(result.full).toBe('Auth');
  });

  it('handles CamelCase splitting for alias generation', () => {
    const result = aliasParticipant('ServiceMetadataProvider', 20);
    // Should produce capitals from each word: S, M, P → SMP
    expect(result.alias).toBe('SMP');
  });
});

// ─── emitSequenceDiagram ──────────────────────────────────────────────────────

describe('emitSequenceDiagram', () => {
  it('produces a fenced mermaid block', () => {
    const out = emitSequenceDiagram({
      participants: ['A', 'B', 'C'],
      messages: [
        { from: 'A', to: 'B', label: 'request', type: 'call' },
        { from: 'B', to: 'C', label: 'query', type: 'call' },
        { from: 'C', to: 'B', label: 'result', type: 'return' },
        { from: 'B', to: 'A', label: 'response', type: 'return' },
        { from: 'A', to: 'B', label: 'done', type: 'call' },
      ],
    });
    expect(out).toMatch(/^```mermaid/);
    expect(out).toMatch(/```$/);
    expect(out).toContain('sequenceDiagram');
  });

  it('includes participant declarations', () => {
    const out = emitSequenceDiagram({
      participants: ['Alice', 'Bob'],
      messages: [{ from: 'Alice', to: 'Bob', label: 'hello', type: 'call' }],
    });
    expect(out).toContain('participant Alice');
    expect(out).toContain('participant Bob');
  });

  it('uses ->> for call and -->> for return', () => {
    const out = emitSequenceDiagram({
      participants: ['A', 'B'],
      messages: [
        { from: 'A', to: 'B', label: 'call', type: 'call' },
        { from: 'B', to: 'A', label: 'ret', type: 'return' },
      ],
    });
    expect(out).toContain('A->>B: call');
    expect(out).toContain('B-->>A: ret');
  });

  it('emits Note over for note type', () => {
    const out = emitSequenceDiagram({
      participants: ['A', 'B'],
      messages: [{ from: 'A', to: 'B', label: 'important', type: 'note' }],
    });
    expect(out).toContain('Note over');
  });

  // alt/loop block messages are deferred to Phase 2 — they require nested
  // body[] on SequenceMessage to emit a closing `end` token. An open `alt`/`loop`
  // without `end` crashes Mermaid's parser, so we removed them from the union
  // until block-scope semantics are modeled.

  it('truncates messages past cap and appends collapse note', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      from: 'A',
      to: 'B',
      label: `msg${i}`,
      type: 'call' as const,
    }));
    const out = emitSequenceDiagram({ participants: ['A', 'B'], messages }, { maxMessages: 25 });
    // Should contain collapse note
    expect(out).toContain('more messages collapsed');
    // Should not contain msg25 through msg29
    expect(out).not.toContain('msg29');
  });

  it('injects neutral theme init directive', () => {
    const out = emitSequenceDiagram(
      {
        participants: ['A', 'B'],
        messages: [{ from: 'A', to: 'B', label: 'x', type: 'call' }],
      },
      { theme: 'neutral' },
    );
    expect(out).toContain("%%{init: {'theme': 'neutral'}}%%");
  });

  it('does NOT inject theme directive when theme is default', () => {
    const out = emitSequenceDiagram(
      {
        participants: ['A', 'B'],
        messages: [{ from: 'A', to: 'B', label: 'x', type: 'call' }],
      },
      { theme: 'default' },
    );
    expect(out).not.toContain('%%{init');
  });

  it('wraps in <details> when collapsibleDetails is true', () => {
    const out = emitSequenceDiagram(
      {
        participants: ['A', 'B'],
        messages: [{ from: 'A', to: 'B', label: 'x', type: 'call' }],
      },
      { collapsibleDetails: true },
    );
    expect(out).toContain('<details>');
    expect(out).toContain('</details>');
    expect(out).toContain('<summary>');
  });

  it('golden snapshot — basic 3-participant 5-message diagram', () => {
    const out = emitSequenceDiagram(
      {
        participants: ['Client', 'Server', 'DB'],
        messages: [
          { from: 'Client', to: 'Server', label: 'request', type: 'call' },
          { from: 'Server', to: 'DB', label: 'query', type: 'call' },
          { from: 'DB', to: 'Server', label: 'rows', type: 'return' },
          { from: 'Server', to: 'Client', label: 'response', type: 'return' },
          { from: 'Client', to: 'Server', label: 'done', type: 'call' },
        ],
      },
      { theme: 'neutral' },
    );
    expect(out).toMatchInlineSnapshot(`
"${'`'}${'`'}${'`'}mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
  participant Client
  participant Server
  participant DB
  Client->>Server: request
  Server->>DB: query
  DB-->>Server: rows
  Server-->>Client: response
  Client->>Server: done
${'`'}${'`'}${'`'}"
`);
  });
});

// ─── emitFlowchart ────────────────────────────────────────────────────────────

describe('emitFlowchart', () => {
  it('produces a fenced mermaid block', () => {
    const out = emitFlowchart({
      nodes: [
        { id: 'A', label: 'NodeA' },
        { id: 'B', label: 'NodeB' },
        { id: 'C', label: 'NodeC' },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
    });
    expect(out).toMatch(/^```mermaid/);
    expect(out).toMatch(/```$/);
    expect(out).toContain('flowchart');
  });

  it('injects ⚠️ warn text into node label', () => {
    const out = emitFlowchart({
      nodes: [
        { id: 'A', label: 'NodeA', warn: 'HIGH risk' },
        { id: 'B', label: 'NodeB' },
      ],
      edges: [],
    });
    expect(out).toContain('⚠️');
    expect(out).toContain('HIGH risk');
  });

  it('uses TD direction by default for small graphs', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, label: `Node${i}` }));
    const out = emitFlowchart({ nodes, edges: [] });
    expect(out).toContain('flowchart TD');
  });

  it('auto-switches to LR past 15 nodes', () => {
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, label: `Node${i}` }));
    const out = emitFlowchart({ nodes, edges: [] });
    expect(out).toContain('flowchart LR');
  });

  it('respects explicit direction override', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: `Node${i}` }));
    const out = emitFlowchart({ nodes, edges: [], direction: 'TD' });
    expect(out).toContain('flowchart TD');
  });

  it('groups into subgraphs past 80 nodes', () => {
    const nodes = Array.from({ length: 85 }, (_, i) => ({
      id: `groupA/node${i}`,
      label: `Node${i}`,
    }));
    const out = emitFlowchart({ nodes, edges: [] }, { maxNodes: 80 });
    expect(out).toContain('subgraph');
    expect(out).toContain('nodes collapsed');
  });

  it('emits edge labels when provided', () => {
    const out = emitFlowchart({
      nodes: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ],
      edges: [{ from: 'A', to: 'B', label: 'calls' }],
    });
    expect(out).toContain('calls');
    expect(out).toContain('-->|');
  });

  it('emits plain arrow when no edge label', () => {
    const out = emitFlowchart({
      nodes: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    });
    expect(out).toContain(' --> ');
  });

  it('injects neutral theme init directive', () => {
    const out = emitFlowchart(
      { nodes: [{ id: 'A', label: 'A' }], edges: [] },
      { theme: 'neutral' },
    );
    expect(out).toContain("%%{init: {'theme': 'neutral'}}%%");
  });

  it('wraps in <details> when collapsibleDetails is true', () => {
    const out = emitFlowchart(
      { nodes: [{ id: 'A', label: 'A' }], edges: [] },
      { collapsibleDetails: true },
    );
    expect(out).toContain('<details>');
    expect(out).toContain('</details>');
  });

  it('golden snapshot — basic 3-node flowchart with edge label', () => {
    const out = emitFlowchart(
      {
        nodes: [
          { id: 'auth', label: 'AuthService' },
          { id: 'db', label: 'Database' },
          { id: 'cache', label: 'CacheLayer' },
        ],
        edges: [
          { from: 'auth', to: 'db', label: 'query' },
          { from: 'auth', to: 'cache', label: 'lookup' },
        ],
        direction: 'TD',
      },
      { theme: 'neutral' },
    );
    expect(out).toMatchInlineSnapshot(`
      "\`\`\`mermaid
      %%{init: {'theme': 'neutral'}}%%
      flowchart TD
        auth["AuthService"]
        db["Database"]
        cache["CacheLayer"]
        auth -->|query| db
        auth -->|lookup| cache
      \`\`\`"
    `);
  });
});
