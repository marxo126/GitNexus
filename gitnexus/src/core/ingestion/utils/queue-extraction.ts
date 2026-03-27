/**
 * Shared queue pattern extraction for BullMQ + Temporal.
 * Used by both parse-worker (worker threads) and pipeline (sequential fallback).
 */
import type { ExtractedQueuePattern } from '../workers/parse-worker.js';

// ---------------------------------------------------------------------------
// BullMQ regexes
// ---------------------------------------------------------------------------

/** Matches `const q = new Queue('orders')` -- captures var name + queue name */
const BULLMQ_QUEUE_DECL_RE = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+Queue\s*\(\s*['"]([\w][\w:.-]*)['"]/g;

/** Matches `q.add(...)` or `q.addBulk(...)` -- captures var name + method */
const BULLMQ_ADD_RE = /(\w+)\.(add|addBulk)\s*\(/g;

/** Matches `new Worker('orders', ...)` -- captures queue name */
const BULLMQ_WORKER_RE = /new\s+Worker\s*\(\s*['"]([\w][\w:.-]*)['"]/g;

// ---------------------------------------------------------------------------
// Temporal regexes (more specific to avoid false positives)
// ---------------------------------------------------------------------------

/**
 * Matches Temporal workflow.start/execute with taskQueue option.
 * Pattern: `client.workflow.start(workflowFn, { taskQueue: 'orders' })`
 * Captures: [1] = start|execute, [2] = workflow function name
 */
const TEMPORAL_WORKFLOW_START_RE = /client\.workflow\.(start|execute)\s*\(\s*(\w+)/g;

/**
 * Matches Temporal activity invocations -- but ONLY when preceded by a
 * `proxyActivities` import/call to reduce false positives on generic
 * `activities.foo()` calls in non-Temporal code.
 */
const TEMPORAL_PROXY_ACTIVITIES_RE = /proxyActivities/;

/**
 * Matches `activities.methodName(...)` -- captures method name.
 * Only used when TEMPORAL_PROXY_ACTIVITIES_RE confirms Temporal context.
 */
const TEMPORAL_ACTIVITY_CALL_RE = /activities\.(\w+)\s*\(/g;

// ---------------------------------------------------------------------------
// Line number helper
// ---------------------------------------------------------------------------

/**
 * Build a sorted array of newline offsets so lineAt lookups are O(log n)
 * via binary search instead of O(n) per call.
 */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) offsets.push(i);
  }
  return offsets;
}

function lineAt(offsets: number[], index: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] < index) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

/**
 * Extract BullMQ and Temporal queue patterns from file content.
 * Appends results to `out` array (avoids allocation when no patterns found).
 */
export function extractQueuePatterns(
  filePath: string,
  content: string,
  out: ExtractedQueuePattern[],
): void {
  const hasBullMQ = content.includes('new Queue') || content.includes('new Worker');
  const hasTemporal = content.includes('proxyActivities') || content.includes('client.workflow.');

  if (!hasBullMQ && !hasTemporal) return;

  const offsets = buildLineOffsets(content);

  // --- BullMQ ---
  if (hasBullMQ) {
    // Build variable-name -> queue-name map from `new Queue('name')` declarations
    const queueVarMap = new Map<string, string>();
    BULLMQ_QUEUE_DECL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BULLMQ_QUEUE_DECL_RE.exec(content)) !== null) {
      queueVarMap.set(m[1], m[2]);
    }

    // Producer: q.add() / q.addBulk()
    BULLMQ_ADD_RE.lastIndex = 0;
    while ((m = BULLMQ_ADD_RE.exec(content)) !== null) {
      const qn = queueVarMap.get(m[1]);
      if (qn) {
        out.push({
          filePath,
          role: 'producer',
          queueName: qn,
          method: m[2],
          lineNumber: lineAt(offsets, m.index),
        });
      }
    }

    // Consumer: new Worker('name', ...)
    BULLMQ_WORKER_RE.lastIndex = 0;
    while ((m = BULLMQ_WORKER_RE.exec(content)) !== null) {
      out.push({
        filePath,
        role: 'consumer',
        queueName: m[1],
        lineNumber: lineAt(offsets, m.index),
      });
    }
  }

  // --- Temporal ---
  if (hasTemporal) {
    let m: RegExpExecArray | null;

    // Workflow starter: client.workflow.start(workflowFn, { taskQueue: 'orders' })
    // Extract the actual taskQueue name from the options object
    if (content.includes('client.workflow.')) {
      TEMPORAL_WORKFLOW_START_RE.lastIndex = 0;
      while ((m = TEMPORAL_WORKFLOW_START_RE.exec(content)) !== null) {
        const workflowFnName = m[2];
        const startMethod = m[1];

        // Look ahead in the next ~500 chars for taskQueue option
        const lookAhead = content.substring(m.index, m.index + 500);
        const tqMatch = lookAhead.match(/taskQueue\s*:\s*['"]([^'"]+)['"]/);
        const taskQueueName = tqMatch ? tqMatch[1] : workflowFnName;

        out.push({
          filePath,
          role: 'producer',  // workflow.start is a producer (enqueues work)
          queueName: taskQueueName,
          method: startMethod,
          handlerName: workflowFnName,
          lineNumber: lineAt(offsets, m.index),
        });
      }
    }

    // Activity calls: activities.methodName() -- these are ENQUEUES (dispatching work)
    // Only match when file uses proxyActivities (Temporal-specific)
    if (TEMPORAL_PROXY_ACTIVITIES_RE.test(content)) {
      TEMPORAL_ACTIVITY_CALL_RE.lastIndex = 0;
      while ((m = TEMPORAL_ACTIVITY_CALL_RE.exec(content)) !== null) {
        out.push({
          filePath,
          role: 'producer',  // activity invocation dispatches work to task queue
          queueName: m[1],
          handlerName: m[1],
          lineNumber: lineAt(offsets, m.index),
        });
      }
    }
  }
}
