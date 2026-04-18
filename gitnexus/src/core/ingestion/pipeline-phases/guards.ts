/**
 * Phase: guards
 *
 * Enriches Function/Method nodes with guard clause metadata and annotates
 * CALLS edges with guard conditions (guarded calls).
 *
 * Runs after crossFile so all Function/Method nodes and CALLS edges are present.
 *
 * @deps    crossFile
 * @reads   graph (Function/Method nodes, CALLS edges)
 * @writes  graph (node.properties.guardClauses, rel.guard)
 * @output  guardCount, guardedCallCount
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getLanguageFromFilename } from 'gitnexus-shared';
import type { GraphRelationship } from 'gitnexus-shared';
import { extractGuards } from '../guard-extractor.js';
import { readFileContents } from '../filesystem-walker.js';
import { isDev } from '../utils/env.js';

export interface GuardsOutput {
  guardCount: number;
  guardedCallCount: number;
}

export const guardsPhase: PipelinePhase<GuardsOutput> = {
  name: 'guards',
  deps: ['crossFile'],

  async execute(
    ctx: PipelineContext,
    _deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<GuardsOutput> {
    // Build file → nodes map for Function/Method nodes
    const fileGroups = new Map<string, { label: string; id: string; name: string }[]>();
    ctx.graph.forEachNode((n) => {
      if (n.label !== 'Function' && n.label !== 'Method') return;
      const fp = n.properties.filePath as string | undefined;
      if (!fp) return;
      let group = fileGroups.get(fp);
      if (!group) {
        group = [];
        fileGroups.set(fp, group);
      }
      group.push({ label: n.label, id: n.id, name: n.properties.name as string });
    });

    if (fileGroups.size === 0) {
      return { guardCount: 0, guardedCallCount: 0 };
    }

    // Pre-index CALLS edges by source file path for O(1) lookup per file
    const callsBySourceFile = new Map<
      string,
      { rel: GraphRelationship; targetName: string; sourceName: string }[]
    >();
    ctx.graph.forEachRelationship((rel) => {
      if (rel.type !== 'CALLS') return;
      const sourceNode = ctx.graph.getNode(rel.sourceId);
      const targetNode = ctx.graph.getNode(rel.targetId);
      if (!sourceNode || !targetNode) return;
      const fp = sourceNode.properties.filePath as string | undefined;
      if (!fp) return;
      let bucket = callsBySourceFile.get(fp);
      if (!bucket) {
        bucket = [];
        callsBySourceFile.set(fp, bucket);
      }
      bucket.push({
        rel,
        targetName: targetNode.properties.name as string,
        sourceName: sourceNode.properties.name as string,
      });
    });

    const filePaths = [...fileGroups.keys()];
    const fileContents = await readFileContents(ctx.repoPath, filePaths);
    let guardCount = 0;
    let guardedCallCount = 0;

    for (const [filePath, content] of fileContents) {
      const language = getLanguageFromFilename(filePath);
      if (!language) continue;

      // Single parse pass extracts both guard clauses and guarded calls
      const { clauses, calls: guardedCalls } = extractGuards(content, language);

      if (clauses.length > 0) {
        const nodes = fileGroups.get(filePath) ?? [];
        for (const nodeRef of nodes) {
          const nodeGuards = clauses.filter(
            (g) => g.functionName === nodeRef.name && g.confidence >= 0.5,
          );
          if (nodeGuards.length > 0) {
            const node = ctx.graph.getNode(nodeRef.id);
            if (node) {
              (node.properties as Record<string, unknown>).guardClauses = nodeGuards.map((g) => ({
                condition: g.condition,
                returnStatus: g.returnStatus,
                confidence: g.confidence,
                line: g.line,
              }));
              guardCount += nodeGuards.length;
            }
          }
        }
      }

      // Match guarded calls to pre-indexed CALLS edges for this file
      const fileCalls = callsBySourceFile.get(filePath);
      if (fileCalls && guardedCalls.length > 0) {
        for (const gc of guardedCalls) {
          for (const { rel, targetName, sourceName } of fileCalls) {
            if (targetName !== gc.calledName) continue;
            if (gc.functionName && sourceName !== gc.functionName) continue;
            (rel as unknown as Record<string, unknown>).guard = gc.guard;
            guardedCallCount++;
          }
        }
      }
    }

    if (isDev && (guardCount > 0 || guardedCallCount > 0)) {
      console.log(
        `🛡️ Guard detection: ${guardCount} guard clauses, ${guardedCallCount} guarded call edges`,
      );
    }

    return { guardCount, guardedCallCount };
  },
};
