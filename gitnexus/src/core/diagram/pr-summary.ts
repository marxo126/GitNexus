/**
 * PR Review Summary Composer
 *
 * Combines GitNexus graph data (changed symbols, impact results, processes)
 * into a Greptile-style Markdown PR review block with Confidence Score,
 * Files Changed table, and auto-selected Mermaid diagrams.
 *
 * Design (research brief 2026-05-03):
 * - Skip diagrams for trivial diffs (≤2 symbols, single module) — Greptile rule
 * - Sequence diagram when cross_community process touched (≥2 modules)
 * - Flowchart when d=1 deps span ≥2 files OR any warn node present
 * - Confidence Score N/5 derived from impact risk
 */

import { emitSequenceDiagram, emitFlowchart } from './mermaid-emit.js';
import type { SequenceInput, FlowchartNode, FlowchartEdge, DiagramTheme } from './mermaid-emit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChangedSymbol {
  id: string;
  name: string;
  type: string;
  filePath: string;
  change_type?: string;
}

export interface ImpactResult {
  risk?: string; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  impactedCount?: number;
  byDepth?: {
    d1?: Array<{ name: string; filePath?: string }>;
    d2?: Array<{ name: string; filePath?: string }>;
    d3?: Array<{ name: string; filePath?: string }>;
  };
  affected_processes?: Array<{ name: string; process_type?: string }>;
}

export interface ProcessNode {
  id: string;
  label: string;
  heuristicLabel: string;
  processType: 'intra_community' | 'cross_community';
  stepCount: number;
  communities: string[];
  entryPointId: string;
  terminalId: string;
  trace: string[];
}

export interface PRSummaryArgs {
  changedSymbols: ChangedSymbol[];
  impactByTarget: Map<string, ImpactResult>;
  processes: ProcessNode[];
  theme?: DiagramTheme;
}

// ─── Confidence score ─────────────────────────────────────────────────────────

/**
 * Derive a 1–5 Confidence Score from impact risk data.
 *
 * 5/5 = LOW risk + ≤3 d=1 deps
 * 4/5 = MEDIUM risk OR 4–9 d=1 deps
 * 3/5 = default / unknown
 * 2/5 = HIGH risk OR 10+ d=1 deps
 * 1/5 = CRITICAL or any d=1 test missing (no d=1 covered)
 */
function deriveConfidenceScore(impactByTarget: Map<string, ImpactResult>): number {
  if (impactByTarget.size === 0) return 3;

  const risks = Array.from(impactByTarget.values()).map((r) => (r.risk ?? 'UNKNOWN').toUpperCase());

  if (risks.includes('CRITICAL')) return 1;

  const allD1 = Array.from(impactByTarget.values()).flatMap((r) => r.byDepth?.d1 ?? []);
  const d1Count = allD1.length;

  if (risks.includes('HIGH') || d1Count >= 10) return 2;
  if (risks.includes('MEDIUM') || (d1Count >= 4 && d1Count <= 9)) return 4;
  if (risks.every((r) => r === 'LOW') && d1Count <= 3) return 5;

  return 3;
}

// ─── Module grouping helpers ──────────────────────────────────────────────────

function moduleFromPath(filePath: string): string {
  // Extract top-level src dir segment: src/core/foo.ts → core
  const parts = filePath.replace(/\\/g, '/').split('/');
  const srcIdx = parts.findIndex((p) => p === 'src');
  if (srcIdx !== -1 && parts.length > srcIdx + 1) return parts[srcIdx + 1];
  return parts[0] ?? 'root';
}

function groupByFile(symbols: ChangedSymbol[]): Map<string, ChangedSymbol[]> {
  const byFile = new Map<string, ChangedSymbol[]>();
  for (const sym of symbols) {
    if (!byFile.has(sym.filePath)) byFile.set(sym.filePath, []);
    byFile.get(sym.filePath)!.push(sym);
  }
  return byFile;
}

// ─── Summary bullets ──────────────────────────────────────────────────────────

function buildSummaryBullets(
  changedSymbols: ChangedSymbol[],
  byFile: Map<string, ChangedSymbol[]>,
  modules: Set<string>,
): string[] {
  const bullets: string[] = [];

  bullets.push(
    `${changedSymbols.length} symbol${changedSymbols.length !== 1 ? 's' : ''} changed across ${byFile.size} file${byFile.size !== 1 ? 's' : ''}`,
  );

  if (modules.size > 0) {
    bullets.push(`Modules affected: ${Array.from(modules).join(', ')}`);
  }

  const types = new Set(changedSymbols.map((s) => s.type).filter(Boolean));
  if (types.size > 0) {
    bullets.push(`Symbol types: ${Array.from(types).join(', ')}`);
  }

  return bullets.slice(0, 3);
}

// ─── Files changed table ──────────────────────────────────────────────────────

// Strip chars that break Markdown table cells or inline-code spans:
//   |  → table-cell delimiter
//   `  → terminates inline code span
//   newlines → break row layout
function sanitizeCell(value: string): string {
  return value.replace(/[`|\r\n]/g, '');
}

function buildFilesTable(byFile: Map<string, ChangedSymbol[]>): string {
  const rows: string[] = ['| Filename | Overview |', '| --- | --- |'];
  for (const [filePath, syms] of byFile) {
    const names = syms
      .slice(0, 4)
      .map((s) => `\`${sanitizeCell(s.name)}\``)
      .join(', ');
    const more = syms.length > 4 ? ` +${syms.length - 4} more` : '';
    const shortPath = sanitizeCell(filePath.replace(/\\/g, '/').split('/').slice(-2).join('/'));
    rows.push(`| \`${shortPath}\` | ${names}${more} |`);
  }
  return rows.join('\n');
}

// ─── Sequence diagram builder ─────────────────────────────────────────────────

function buildSequenceDiagram(
  processes: ProcessNode[],
  changedSymbols: ChangedSymbol[],
  symbolByName: Map<string, ChangedSymbol>,
  moduleByName: Map<string, string>,
  modules: Set<string>,
  theme: DiagramTheme,
): string | null {
  // Only emit if cross_community process touched ≥2 modules
  const crossProcs = processes.filter((p) => p.processType === 'cross_community');
  if (crossProcs.length === 0) return null;
  if (modules.size < 2) return null;

  // Build participants from changed symbol modules (up to 6)
  const participants = Array.from(modules).slice(0, 6);

  // `trace` entries are symbol *names* (set by handler from changed_steps[].symbol).
  // Look up by name, not id: ChangedSymbol.id is a node UUID while trace holds
  // the human name. O(1) Map lookup replaces the prior O(N) Array.find.
  const messages: SequenceInput['messages'] = [];

  for (const proc of crossProcs.slice(0, 3)) {
    const tracePairs = proc.trace.slice(0, 8);
    for (let i = 0; i < tracePairs.length - 1 && messages.length < 25; i++) {
      const fromSym = symbolByName.get(tracePairs[i]);
      const toSym = symbolByName.get(tracePairs[i + 1]);
      if (!fromSym || !toSym) continue;
      const fromMod = moduleByName.get(fromSym.name) ?? fromSym.name;
      const toMod = moduleByName.get(toSym.name) ?? toSym.name;
      if (fromMod === toMod) continue;
      if (!participants.includes(fromMod) || !participants.includes(toMod)) continue;
      messages.push({ from: fromMod, to: toMod, label: toSym.name, type: 'call' });
    }
    // Add a process label note
    if (messages.length > 0 && participants.length >= 2) {
      messages.push({
        from: participants[0],
        to: participants[participants.length - 1],
        label: proc.heuristicLabel,
        type: 'note',
      });
    }
  }

  if (messages.length === 0) return null;

  return emitSequenceDiagram({ participants, messages }, { theme, collapsibleDetails: true });
}

// ─── Flowchart builder ────────────────────────────────────────────────────────

function buildFlowchartDiagram(
  changedSymbols: ChangedSymbol[],
  impactByTarget: Map<string, ImpactResult>,
  theme: DiagramTheme,
): string | null {
  // Emit if d=1 deps span ≥2 files OR any warn nodes
  const allD1 = Array.from(impactByTarget.entries()).flatMap(([target, result]) =>
    (result.byDepth?.d1 ?? []).map((dep) => ({ target, dep })),
  );

  const d1Files = new Set(allD1.map((x) => x.dep.filePath).filter(Boolean));
  const hasWarnNodes = Array.from(impactByTarget.values()).some(
    (r) => r.risk === 'HIGH' || r.risk === 'CRITICAL',
  );

  if (d1Files.size < 2 && !hasWarnNodes) return null;

  const nodes: FlowchartNode[] = [];
  const edges: FlowchartEdge[] = [];
  const seenIds = new Set<string>();

  // Add changed symbols as source nodes
  for (const sym of changedSymbols.slice(0, 20)) {
    const id = `sym_${sym.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (!seenIds.has(id)) {
      const impact = impactByTarget.get(sym.name);
      const warn =
        impact?.risk === 'HIGH'
          ? 'HIGH risk'
          : impact?.risk === 'CRITICAL'
            ? 'CRITICAL risk'
            : undefined;
      nodes.push({ id, label: sym.name, warn });
      seenIds.add(id);
    }
  }

  // Add d=1 dependents
  for (const { target, dep } of allD1.slice(0, 60)) {
    const targetId = `sym_${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const depId = `dep_${dep.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (!seenIds.has(depId)) {
      nodes.push({ id: depId, label: dep.name });
      seenIds.add(depId);
    }
    edges.push({ from: targetId, to: depId, label: 'd=1' });
  }

  if (nodes.length === 0) return null;

  return emitFlowchart({ nodes, edges }, { theme, collapsibleDetails: true });
}

// ─── Main composer ────────────────────────────────────────────────────────────

/**
 * Build a Greptile-style PR review Markdown block.
 *
 * Sections (in order):
 * 1. GitNexus Summary — 2-3 bullets
 * 2. Confidence Score N/5
 * 3. Important Files Changed table
 * 4. Sequence Diagram (conditional)
 * 5. Dependency Flowchart (conditional)
 *
 * Trivial diff (≤2 symbols, single module) → skips both diagrams.
 */
export function buildPRSummary(args: PRSummaryArgs): string {
  const { changedSymbols, impactByTarget, processes } = args;
  const theme: DiagramTheme = args.theme ?? 'neutral';

  // Precompute shared maps once — every consumer below reads these instead of
  // recomputing moduleFromPath/byFile/symbolByName independently.
  const byFile = groupByFile(changedSymbols);
  const moduleByName = new Map(changedSymbols.map((s) => [s.name, moduleFromPath(s.filePath)]));
  const symbolByName = new Map(changedSymbols.map((s) => [s.name, s]));
  const modules = new Set(moduleByName.values());

  const sections: string[] = [];

  // ── 1. Summary ──────────────────────────────────────────────────────
  const bullets = buildSummaryBullets(changedSymbols, byFile, modules);
  sections.push('### GitNexus Summary\n' + bullets.map((b) => `- ${b}`).join('\n'));

  // ── 2. Confidence Score ─────────────────────────────────────────────
  const score = deriveConfidenceScore(impactByTarget);
  const scoreLabel = [
    '',
    'Low confidence',
    'Needs review',
    'Moderate',
    'Good coverage',
    'High confidence',
  ][score];
  sections.push(`### Confidence Score: ${score}/5\n_${scoreLabel}_`);

  // ── 3. Files Changed table ──────────────────────────────────────────
  if (changedSymbols.length > 0) {
    sections.push('### Important Files Changed\n' + buildFilesTable(byFile));
  }

  // ── Trivial diff check — skip diagrams ─────────────────────────────
  const isTrivial = changedSymbols.length <= 2 && modules.size <= 1;

  if (!isTrivial) {
    // ── 4. Sequence Diagram ─────────────────────────────────────────────
    const sequenceDiagram = buildSequenceDiagram(
      processes,
      changedSymbols,
      symbolByName,
      moduleByName,
      modules,
      theme,
    );
    if (sequenceDiagram) {
      sections.push('### Sequence Diagram\n' + sequenceDiagram);
    }

    // ── 5. Dependency Flowchart ─────────────────────────────────────────
    const flowchart = buildFlowchartDiagram(changedSymbols, impactByTarget, theme);
    if (flowchart) {
      sections.push('### Dependency Flowchart\n' + flowchart);
    }
  }

  return sections.join('\n\n');
}
