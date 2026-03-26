/**
 * A11y Processor — creates A11ySignal nodes and HAS_A11Y_SIGNAL edges
 *
 * Takes detected A11ySignal objects from the rule engine and persists them
 * into the knowledge graph. Each signal becomes a node, linked to its
 * enclosing function/method/file via HAS_A11Y_SIGNAL edges.
 */

import type { A11ySignal } from './a11y-rules/types.js';
import type { KnowledgeGraph } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

export interface A11yProcessorResult {
  signalsCreated: number;
  edgesCreated: number;
  violations: number;
  needsReview: number;
}

/**
 * Find the best source node ID for an A11ySignal.
 * Tries: Function → Method → File (same pattern as route/tool processors).
 */
function findSourceNodeId(signal: A11ySignal, graph: KnowledgeGraph): string | undefined {
  // Try Function node (most common for JSX components)
  for (const prefix of ['Function', 'Method']) {
    // Pattern: "Function:filePath:functionName"
    const candidateId = `${prefix}:${signal.filePath}:${signal.enclosingFunction || ''}`;
    if (signal.enclosingFunction && graph.getNode(candidateId)) {
      return candidateId;
    }
  }

  // Fall back to File node
  const fileId = generateId('File', signal.filePath);
  if (graph.getNode(fileId)) {
    return fileId;
  }

  return undefined;
}

export function processA11ySignals(
  signals: A11ySignal[],
  graph: KnowledgeGraph,
): A11yProcessorResult {
  let signalsCreated = 0;
  let edgesCreated = 0;
  let violations = 0;
  let needsReview = 0;

  for (const signal of signals) {
    // Create A11ySignal node
    const signalNodeId = generateId('A11ySignal', `${signal.filePath}:${signal.startLine}:${signal.name}`);

    graph.addNode({
      id: signalNodeId,
      label: 'A11ySignal',
      properties: {
        name: signal.name,
        filePath: signal.filePath,
        startLine: signal.startLine,
        criterion: signal.criterion,
        signalStatus: signal.status,
        severity: signal.severity,
        element: signal.element,
        complianceTag: signal.complianceTag,
        confidence: signal.confidence,
      },
    });
    signalsCreated++;

    if (signal.status === 'violation') violations++;
    else if (signal.status === 'needs-review') needsReview++;

    // Create HAS_A11Y_SIGNAL edge from enclosing function/file
    const sourceId = findSourceNodeId(signal, graph);
    if (sourceId) {
      graph.addRelationship({
        id: generateId('HAS_A11Y_SIGNAL', `${sourceId}->${signalNodeId}`),
        sourceId,
        targetId: signalNodeId,
        type: 'HAS_A11Y_SIGNAL',
        confidence: signal.confidence === 'definite' ? 1.0 : signal.confidence === 'likely' ? 0.85 : 0.7,
        reason: `wcag-${signal.criterion}`,
      });
      edgesCreated++;
    }
  }

  return { signalsCreated, edgesCreated, violations, needsReview };
}
