/**
 * Mermaid Diagram Emitter
 *
 * Pure-function module for emitting Mermaid sequence and flowchart diagrams
 * from GitNexus graph data. Implements proper escaping and size caps based
 * on Mermaid parser constraints (mermaid-js #170, #3262, #5042).
 *
 * Design rules (from research brief 2026-05-03):
 * - Escape: wrap labels in quotes for ().:- chars; HTML refs for # and ;; token `end` always quoted
 * - Caps: 25 messages / 6 participants for sequence; 80 nodes for flowchart
 * - Auto-switch TD→LR past 15 nodes
 * - Collapsible wrapper (CodeRabbit pattern)
 * - theme directive via init comment
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiagramTheme = 'default' | 'neutral';

export interface EmitOpts {
  maxMessages?: number;
  maxNodes?: number;
  maxParticipants?: number;
  theme?: DiagramTheme;
  collapsibleDetails?: boolean;
}

// Note: alt/loop block messages deferred to Phase 2 (need nested body[]
// to emit closing `end` token; current single-message API cannot represent
// block scope, and an unclosed `alt`/`loop` crashes the Mermaid parser).
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  type: 'call' | 'return' | 'note';
}

export interface SequenceNote {
  over: [string, string];
  text: string;
}

export interface SequenceInput {
  participants: string[];
  messages: SequenceMessage[];
  notes?: SequenceNote[];
}

export interface FlowchartNode {
  id: string;
  label: string;
  warn?: string;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowchartInput {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  direction?: 'TD' | 'LR';
}

// ─── Escaping ─────────────────────────────────────────────────────────────────

/**
 * Escape a Mermaid label.
 *
 * Rules (mermaid-js #170, #3262):
 * - Replace `#` → `#35;` and `;` → `#59;` in a single pass to avoid cascading
 * - Wrap in double-quotes if label contains `( ) . : - ;` or is the token `end`
 * - Preserve `\n` inside quoted labels for line breaks
 * - Plain text with no special chars passes through unchanged
 */
export function escapeLabel(text: string): string {
  // Single-pass replacement: replace #, ;, " in one regex to avoid cascading
  // and to neutralize Mermaid `click`/`href` injection via crafted symbol names
  // (a stray `"` would close the quoted label and let attacker syntax follow).
  const escaped = text.replace(/[#;"]/g, (ch) => {
    if (ch === '#') return '#35;';
    if (ch === ';') return '#59;';
    return '#34;'; // "
  });

  // Determine whether quoting is needed:
  // - original text contains any of ( ) . : - (ASCII hyphen escaped as \-)
  // - original text contains ; or " (replaced above, but presence implies metachar)
  // - is exactly the reserved token `end`
  const needsQuotes = /[();.:\-]/.test(text) || text.trim() === 'end';

  if (needsQuotes) {
    return `"${escaped}"`;
  }
  return escaped;
}

// ─── Participant aliasing ─────────────────────────────────────────────────────

/**
 * Produce a short alias for long participant names.
 * Returns `{alias, full}` for use in `participant <alias> as <full>`.
 * When name is already ≤ maxLen, alias === full (no `as` clause needed).
 */
export function aliasParticipant(name: string, maxLen = 20): { alias: string; full: string } {
  if (name.length <= maxLen) return { alias: name, full: name };
  // Build alias from capitalised initials of each word/segment
  const words = name.split(/(?=[A-Z])|[_\-.\s]+/).filter(Boolean);
  const alias = words.map((w) => w[0].toUpperCase()).join('');
  return { alias: alias || name.slice(0, maxLen), full: name };
}

// ─── Sequence diagram emitter ─────────────────────────────────────────────────

const DEFAULT_MAX_MESSAGES = 25;
const DEFAULT_MAX_PARTICIPANTS = 6;

/**
 * Emit a Mermaid `sequenceDiagram` block.
 *
 * Caps: 25 messages / 6 participants by default.
 * Overflow: truncate + append a `Note over` collapse annotation.
 * Output: fenced ```mermaid block, optionally wrapped in <details>.
 */
export function emitSequenceDiagram(input: SequenceInput, opts: EmitOpts = {}): string {
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxParticipants = opts.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;

  // Truncate participants
  const participants = input.participants.slice(0, maxParticipants);
  const participantSet = new Set(participants);

  // Filter messages to known participants, then cap
  const allMessages = input.messages.filter(
    (m) => participantSet.has(m.from) && participantSet.has(m.to),
  );
  const truncated = allMessages.length > maxMessages;
  const messages = allMessages.slice(0, maxMessages);
  const collapsedCount = allMessages.length - messages.length;

  const lines: string[] = [];

  // Theme directive
  if (opts.theme === 'neutral') {
    lines.push(`%%{init: {'theme': 'neutral'}}%%`);
  }

  lines.push('sequenceDiagram');

  // Participant declarations with alias support
  for (const p of participants) {
    const { alias, full } = aliasParticipant(p);
    if (alias !== full) {
      lines.push(`  participant ${alias} as ${escapeLabel(full)}`);
    } else {
      lines.push(`  participant ${escapeLabel(p)}`);
    }
  }

  // Messages
  for (const msg of messages) {
    const { alias: fromAlias } = aliasParticipant(msg.from);
    const { alias: toAlias } = aliasParticipant(msg.to);
    const label = escapeLabel(msg.label);

    switch (msg.type) {
      case 'return':
        lines.push(`  ${fromAlias}-->>${toAlias}: ${label}`);
        break;
      case 'note':
        lines.push(`  Note over ${fromAlias},${toAlias}: ${label}`);
        break;
      case 'call':
      default:
        lines.push(`  ${fromAlias}->>${toAlias}: ${label}`);
        break;
    }
  }

  // Collapse note when truncated — handle 1-participant case (Note over <p>: ...)
  if (truncated && participants.length >= 1) {
    const collapseNote = `... +${collapsedCount} more messages collapsed`;
    if (participants.length === 1) {
      const only = aliasParticipant(participants[0]).alias;
      lines.push(`  Note over ${only}: ${collapseNote}`);
    } else {
      const first = aliasParticipant(participants[0]).alias;
      const last = aliasParticipant(participants[participants.length - 1]).alias;
      lines.push(`  Note over ${first},${last}: ${collapseNote}`);
    }
  }

  // Explicit notes from input
  if (input.notes) {
    for (const note of input.notes) {
      const a = aliasParticipant(note.over[0]).alias;
      const b = aliasParticipant(note.over[1]).alias;
      if (participantSet.has(note.over[0]) && participantSet.has(note.over[1])) {
        lines.push(`  Note over ${a},${b}: ${escapeLabel(note.text)}`);
      }
    }
  }

  const body = lines.join('\n');
  return wrapDiagram(body, opts, 'Sequence diagram');
}

// ─── Flowchart emitter ────────────────────────────────────────────────────────

const DEFAULT_MAX_NODES = 80;

/**
 * Emit a Mermaid `flowchart` block.
 *
 * Caps: 80 nodes by default.
 * Auto-switch: TD → LR when node count > 15.
 * Overflow: group by module/dir as subgraphs when > 80 nodes.
 * Warn injection: `\n⚠️ {warn}` appended to node label when `warn` present (Greptile pattern).
 * Output: fenced ```mermaid block, optionally wrapped in <details>.
 */
export function emitFlowchart(input: FlowchartInput, opts: EmitOpts = {}): string {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;

  const allNodes = input.nodes;
  const overflow = allNodes.length > maxNodes;

  // Auto-switch to LR past 15 nodes when caller did not pin a direction.
  const direction = input.direction ?? (allNodes.length > 15 ? 'LR' : 'TD');

  const lines: string[] = [];

  // Theme directive
  if (opts.theme === 'neutral') {
    lines.push(`%%{init: {'theme': 'neutral'}}%%`);
  }

  lines.push(`flowchart ${direction}`);

  if (overflow) {
    // Group by module/directory prefix and emit as subgraphs
    const groups = new Map<string, FlowchartNode[]>();
    for (const node of allNodes) {
      // Derive module from node id: first path segment or prefix before `/`
      const parts = node.id.split(/[/\\]/);
      const groupKey = parts.length > 1 ? parts[0] : 'root';
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(node);
    }

    let nodeCount = 0;
    for (const [groupName, groupNodes] of groups) {
      if (nodeCount >= maxNodes) break;
      const safeGroup = groupName.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`  subgraph ${safeGroup}["${groupName}"]`);
      for (const node of groupNodes) {
        if (nodeCount >= maxNodes) break;
        lines.push(`    ${renderNode(node)}`);
        nodeCount++;
      }
      lines.push('  end');
    }

    const hiddenCount = allNodes.length - nodeCount;
    if (hiddenCount > 0) {
      lines.push(`  _overflow["... +${hiddenCount} nodes collapsed"]`);
    }
  } else {
    // Normal node rendering
    for (const node of allNodes) {
      lines.push(`  ${renderNode(node)}`);
    }
  }

  // Edges — only emit edges where both endpoints are in the rendered set
  const renderedIds = new Set(
    overflow ? allNodes.slice(0, maxNodes).map((n) => n.id) : allNodes.map((n) => n.id),
  );

  for (const edge of input.edges) {
    if (!renderedIds.has(edge.from) || !renderedIds.has(edge.to)) continue;
    const safeFrom = sanitizeId(edge.from);
    const safeTo = sanitizeId(edge.to);
    if (edge.label) {
      lines.push(`  ${safeFrom} -->|${escapeLabel(edge.label)}| ${safeTo}`);
    } else {
      lines.push(`  ${safeFrom} --> ${safeTo}`);
    }
  }

  const body = lines.join('\n');
  return wrapDiagram(body, opts, 'Dependency flowchart');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render a single flowchart node declaration.
 * Injects `\n⚠️ {warn}` into the label when `warn` is set (Greptile inline-warning pattern).
 */
function renderNode(node: FlowchartNode): string {
  const id = sanitizeId(node.id);
  const labelText = node.warn ? `${node.label}\n⚠️ ${node.warn}` : node.label;
  // Force-quote flowchart labels: bare `[...]` content breaks on `[ ] ( ) | ` `,
  // so always wrap in `"..."` and HTML-escape `# ; "` via escapeLabel's substitutions.
  const escaped = labelText.replace(/[#;"]/g, (ch) => {
    if (ch === '#') return '#35;';
    if (ch === ';') return '#59;';
    return '#34;';
  });
  return `${id}["${escaped}"]`;
}

/**
 * Sanitize a node ID for use in Mermaid (strip chars that break the parser).
 * Keeps alphanumeric and underscores; replaces everything else with `_`.
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Wrap diagram body in a fenced ```mermaid block.
 * When opts.collapsibleDetails, wrap in a <details> summary block (CodeRabbit pattern).
 */
function wrapDiagram(body: string, opts: EmitOpts, summaryLabel: string): string {
  const fenced = '```mermaid\n' + body + '\n```';
  if (opts.collapsibleDetails) {
    return `<details><summary>${summaryLabel}</summary>\n\n${fenced}\n\n</details>`;
  }
  return fenced;
}
