/**
 * Phase: workflows
 *
 * Detects workflow / state machine status types and transitions.
 * Creates StatusType nodes and TRANSITIONS edges.
 *
 * @deps    parse
 * @reads   allPaths (from parse)
 * @writes  graph (StatusType nodes, DEFINES + TRANSITIONS edges)
 * @output  statusTypeCount, transitionCount
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { generateId } from '../../../lib/utils.js';
import { readFileContents } from '../filesystem-walker.js';
import { isDev } from '../utils/env.js';
import {
  extractStatusTypes,
  extractStatusTransitions,
  type DetectedStatusType,
} from '../workflow-detector.js';

export interface WorkflowsOutput {
  statusTypeCount: number;
  transitionCount: number;
}

export const workflowsPhase: PipelinePhase<WorkflowsOutput> = {
  name: 'workflows',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<WorkflowsOutput> {
    const { allPaths } = getPhaseOutput<ParseOutput>(deps, 'parse');

    const tsCandidates = allPaths.filter(
      (p) =>
        (p.endsWith('.ts') || p.endsWith('.tsx')) &&
        !p.includes('node_modules') &&
        !p.includes('.test.') &&
        !p.includes('.spec.'),
    );

    const tsContents = await readFileContents(ctx.repoPath, tsCandidates);
    const allStatusTypes: DetectedStatusType[] = [];

    for (const [filePath, content] of tsContents) {
      const detected = extractStatusTypes(content, 'typescript', filePath);
      allStatusTypes.push(...detected);
    }

    // Create StatusType nodes + lookup maps for transition matching
    const statusTypeNodeIds = new Map<string, string>();
    const valueToType = new Map<string, DetectedStatusType>();
    const entityToType = new Map<string, DetectedStatusType>();

    for (const st of allStatusTypes) {
      const nodeId = generateId('StatusType', st.name);
      statusTypeNodeIds.set(st.name, nodeId);
      const entityName = st.name
        .replace(/Status$|State$|Phase$|Stage$/i, '')
        .toLowerCase();
      if (entityName) entityToType.set(entityName, st);
      for (const v of st.values) {
        if (!valueToType.has(v)) valueToType.set(v, st);
      }
      ctx.graph.addNode({
        id: nodeId,
        label: 'StatusType',
        properties: {
          name: st.name,
          filePath: st.filePath,
          statusValues: st.values,
          statusKind: st.kind,
        },
      });

      const fileId = generateId('File', st.filePath);
      ctx.graph.addRelationship({
        id: generateId('DEFINES', `${fileId}->${nodeId}`),
        sourceId: fileId,
        targetId: nodeId,
        type: 'DEFINES',
        confidence: 1.0,
        reason: `status-type-${st.kind}`,
      });
    }

    // Scan TS files for status transitions (Prisma .update patterns)
    let transitionCount = 0;
    if (allStatusTypes.length > 0) {
      for (const [filePath, content] of tsContents) {
        const transitions = extractStatusTransitions(content, 'typescript', filePath);
        for (const t of transitions) {
          let matchingType: DetectedStatusType | undefined;
          if (t.entityType) {
            matchingType = entityToType.get(t.entityType.toLowerCase());
          }
          if (!matchingType) {
            matchingType =
              valueToType.get(t.toStatus) ??
              (t.fromStatus ? valueToType.get(t.fromStatus) : undefined);
          }
          if (!matchingType) continue;

          const statusNodeId = statusTypeNodeIds.get(matchingType.name);
          if (!statusNodeId) continue;

          let sourceId: string | undefined;
          if (t.functionName) {
            const funcNode =
              ctx.graph.getNode(
                generateId('Function', `${filePath}::${t.functionName}`),
              ) ??
              ctx.graph.getNode(
                generateId('Method', `${filePath}::${t.functionName}`),
              );
            if (funcNode) sourceId = funcNode.id;
          }
          if (!sourceId) {
            sourceId = generateId('File', filePath);
          }

          const fromPart = t.fromStatus || '*';
          const reasonStr = t.isTransactional
            ? `transactional-update:${t.entityType || ''}:${fromPart}->${t.toStatus}`
            : `direct-update:${t.entityType || ''}:${fromPart}->${t.toStatus}`;

          ctx.graph.addRelationship({
            id: generateId(
              'TRANSITIONS',
              `${sourceId}->${statusNodeId}:${t.toStatus}`,
            ),
            sourceId,
            targetId: statusNodeId,
            type: 'TRANSITIONS',
            confidence: 0.9,
            reason: reasonStr,
            fromStatus: t.fromStatus,
            toStatus: t.toStatus,
            entityType: t.entityType,
            isTransactional: t.isTransactional,
          });

          transitionCount++;
        }
      }
    }

    if (isDev && (allStatusTypes.length > 0 || transitionCount > 0)) {
      console.log(
        `Workflow detection: ${allStatusTypes.length} status types, ${transitionCount} transitions`,
      );
    }

    return { statusTypeCount: allStatusTypes.length, transitionCount };
  },
};
