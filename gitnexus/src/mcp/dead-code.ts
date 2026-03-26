/**
 * Dead Code Detection
 *
 * Detects functions, methods, and classes with zero callers by
 * querying the knowledge graph for incoming edges.
 *
 * Two confidence tiers:
 * - dead: zero incoming CALLS/IMPORTS, not an entry point, not in a process, not a route handler
 * - unused_export: exported but never imported from another file
 */

import { executeQuery } from './core/lbug-adapter.js';
import { isTestFilePath } from './local/local-backend.js';

export interface SymbolWithEdges {
  id: string;
  name: string;
  label: string;
  filePath: string;
  startLine: number;
  isExported: boolean;
  hasIncomingCalls: boolean;
  hasIncomingImports: boolean;
  isEntryPoint: boolean;
  isProcessParticipant: boolean;
  isRouteHandler: boolean;
}

export interface DeadSymbol {
  name: string;
  label: string;
  filePath: string;
  startLine: number;
  tag: 'dead' | 'unused_export';
}

export interface DeadCodeResult {
  summary: {
    total: number;
    dead: number;
    unused_export: number;
    files_affected: number;
  };
  by_file: Array<{
    filePath: string;
    symbols: Array<{
      name: string;
      label: string;
      startLine: number;
      tag: 'dead' | 'unused_export';
    }>;
  }>;
}

/**
 * Pure classification logic — no DB access, fully testable.
 * Takes enriched symbols and returns classified dead symbols sorted by file.
 */
export function classifyDeadSymbols(symbols: SymbolWithEdges[]): DeadSymbol[] {
  const dead: DeadSymbol[] = [];

  for (const sym of symbols) {
    // Skip if it has any incoming calls
    if (sym.hasIncomingCalls) continue;
    // Skip if it's an entry point, process participant, or route handler
    if (sym.isEntryPoint || sym.isProcessParticipant || sym.isRouteHandler) continue;

    if (sym.isExported && !sym.hasIncomingImports) {
      // Exported but never imported — unused_export
      dead.push({
        name: sym.name,
        label: sym.label,
        filePath: sym.filePath,
        startLine: sym.startLine,
        tag: 'unused_export',
      });
    } else if (!sym.isExported && !sym.hasIncomingImports) {
      // Not exported, no callers, not special — dead
      dead.push({
        name: sym.name,
        label: sym.label,
        filePath: sym.filePath,
        startLine: sym.startLine,
        tag: 'dead',
      });
    }
  }

  // Sort by filePath, then startLine
  dead.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
  return dead;
}

/**
 * Query the knowledge graph and detect dead code.
 * Uses batch queries to build incoming-edge sets, then classifies.
 */
export async function findDeadCode(
  repoId: string,
  params: {
    label?: string;
    includeTests?: boolean;
    limit?: number;
  }
): Promise<DeadCodeResult> {
  const { label, includeTests = false, limit = 50 } = params;

  // Step 1: Get all callable nodes (query per label — labels() not supported in Cypher subset)
  const callableLabels = ['Function', 'Method', 'Class', 'Constructor'];
  if (label && !callableLabels.includes(label)) {
    return {
      summary: { total: 0, dead: 0, unused_export: 0, files_affected: 0 },
      by_file: [],
    };
  }
  const labelsToQuery = label ? [label] : callableLabels;
  // isExported exists on Function, Method, Class, Interface — not on Constructor
  const labelsWithExported = new Set(['Function', 'Method', 'Class', 'Interface']);

  const allSymbols: any[] = [];
  for (const lbl of labelsToQuery) {
    const hasExported = labelsWithExported.has(lbl);
    const rows = await executeQuery(repoId, `
      MATCH (n:\`${lbl}\`)
      RETURN n.id AS id, n.name AS name, n.filePath AS filePath,
             n.startLine AS startLine${hasExported ? ', n.isExported AS isExported' : ''}
    `);
    for (const row of rows) {
      allSymbols.push({ ...row, label: lbl, isExported: row.isExported ?? false });
    }
  }

  // Step 2: Build sets of node IDs that have incoming edges
  const [callEdges, importEdges, entryEdges, processEdges, routeEdges] = await Promise.all([
    executeQuery(repoId, `MATCH (caller)-[r:CodeRelation {type: 'CALLS'}]->(target) RETURN DISTINCT target.id AS targetId`),
    executeQuery(repoId, `MATCH (importer)-[r:CodeRelation {type: 'IMPORTS'}]->(target) RETURN DISTINCT target.id AS targetId`),
    executeQuery(repoId, `MATCH (n)-[r:CodeRelation {type: 'ENTRY_POINT_OF'}]->(p) RETURN DISTINCT n.id AS nodeId`),
    executeQuery(repoId, `MATCH (n)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p) RETURN DISTINCT n.id AS nodeId`),
    executeQuery(repoId, `MATCH (n)-[r:CodeRelation {type: 'HANDLES_ROUTE'}]->(route) RETURN DISTINCT n.id AS nodeId`),
  ]);

  const hasIncomingCalls = new Set<string>();
  for (const row of callEdges) {
    hasIncomingCalls.add(row.targetId ?? row[0]);
  }

  const hasIncomingImports = new Set<string>();
  for (const row of importEdges) {
    hasIncomingImports.add(row.targetId ?? row[0]);
  }

  const isEntryPoint = new Set<string>();
  for (const row of entryEdges) {
    isEntryPoint.add(row.nodeId ?? row[0]);
  }

  const isProcessParticipant = new Set<string>();
  for (const row of processEdges) {
    isProcessParticipant.add(row.nodeId ?? row[0]);
  }

  const isRouteHandler = new Set<string>();
  for (const row of routeEdges) {
    isRouteHandler.add(row.nodeId ?? row[0]);
  }

  // Step 3: Enrich symbols with edge info and filter
  const enriched: SymbolWithEdges[] = [];
  for (const row of allSymbols) {
    const id = row.id ?? row[0];
    const filePath = row.filePath ?? row[3] ?? '';

    // Filter test files unless includeTests
    if (!includeTests && isTestFilePath(filePath)) continue;

    enriched.push({
      id,
      name: row.name ?? row[1] ?? '',
      label: row.label ?? row[2] ?? '',
      filePath,
      startLine: row.startLine ?? row[4] ?? 0,
      isExported: row.isExported ?? row[5] ?? false,
      hasIncomingCalls: hasIncomingCalls.has(id),
      hasIncomingImports: hasIncomingImports.has(id),
      isEntryPoint: isEntryPoint.has(id),
      isProcessParticipant: isProcessParticipant.has(id),
      isRouteHandler: isRouteHandler.has(id),
    });
  }

  // Step 4: Classify
  const deadSymbols = classifyDeadSymbols(enriched);

  // Step 5: Apply limit and group by file
  const limited = deadSymbols.slice(0, limit);
  const byFileMap = new Map<string, DeadSymbol[]>();
  for (const sym of limited) {
    const existing = byFileMap.get(sym.filePath);
    if (existing) {
      existing.push(sym);
    } else {
      byFileMap.set(sym.filePath, [sym]);
    }
  }

  const by_file = Array.from(byFileMap.entries()).map(([filePath, symbols]) => ({
    filePath,
    symbols: symbols.map(s => ({
      name: s.name,
      label: s.label,
      startLine: s.startLine,
      tag: s.tag,
    })),
  }));

  const deadCount = limited.filter(s => s.tag === 'dead').length;
  const unusedExportCount = limited.filter(s => s.tag === 'unused_export').length;

  return {
    summary: {
      total: limited.length,
      dead: deadCount,
      unused_export: unusedExportCount,
      files_affected: byFileMap.size,
    },
    by_file,
  };
}
