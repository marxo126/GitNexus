/**
 * Inline queue pattern extraction (sequential fallback path).
 *
 * Extracts BullMQ and Temporal queue patterns from source content using
 * regex patterns. Used by the sequential parse path when workers are
 * not available — the worker path extracts queue patterns via
 * extractQueuePatterns in parse-worker.ts instead.
 *
 * @module
 */

import type { ExtractedQueuePattern } from '../workers/parse-worker.js';

// ── Regex patterns ─────────────────────────────────────────────────────────

const BULLMQ_ADD_RE = /(\w+)\.(add|addBulk)\s*\(/g;
const BULLMQ_WORKER_RE = /new\s+Worker\s*\(\s*['\"](\w[\w-]*)['\"]/g;
const TEMPORAL_ACTIVITY_RE = /activities\.(\w+)\s*\(/g;
const TEMPORAL_WORKFLOW_START_RE = /client\.workflow\.(start|execute)\s*\(\s*(\w+)/g;

// ── Extraction function ───────────────────────────────────────────────────

/**
 * Extract BullMQ and Temporal queue patterns from file content using regex.
 *
 * Fast-path: skips files that don't contain queue-related markers.
 * Results are appended to the `out` array (push pattern avoids allocation).
 *
 * @param filePath  Relative path of the source file
 * @param content   File content string
 * @param out       Output array to append extracted patterns to
 */
export function extractQueuePatternsInline(
  filePath: string,
  content: string,
  out: ExtractedQueuePattern[],
): void {
  const hasBullMQ = content.includes('new Queue') || content.includes('new Worker');
  const hasTemporal = content.includes('activities.') || content.includes('client.workflow.');
  if (!hasBullMQ && !hasTemporal) return;

  if (hasBullMQ) {
    const queueVarMap = new Map<string, string>();
    const assignRe = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+Queue\s*\(\s*['\"](\w[\w-]*)['\"]/g;
    assignRe.lastIndex = 0;
    let m;
    while ((m = assignRe.exec(content)) !== null) {
      queueVarMap.set(m[1], m[2]);
    }
    BULLMQ_ADD_RE.lastIndex = 0;
    while ((m = BULLMQ_ADD_RE.exec(content)) !== null) {
      const qn = queueVarMap.get(m[1]);
      if (qn) {
        out.push({
          filePath,
          role: 'producer',
          queueName: qn,
          method: m[2],
          lineNumber: content.substring(0, m.index).split('\n').length - 1,
        });
      }
    }
    BULLMQ_WORKER_RE.lastIndex = 0;
    while ((m = BULLMQ_WORKER_RE.exec(content)) !== null) {
      out.push({
        filePath,
        role: 'consumer',
        queueName: m[1],
        lineNumber: content.substring(0, m.index).split('\n').length - 1,
      });
    }
  }

  if (hasTemporal) {
    let m;
    TEMPORAL_ACTIVITY_RE.lastIndex = 0;
    while ((m = TEMPORAL_ACTIVITY_RE.exec(content)) !== null) {
      out.push({
        filePath,
        role: 'activity',
        queueName: m[1],
        handlerName: m[1],
        lineNumber: content.substring(0, m.index).split('\n').length - 1,
      });
    }
    TEMPORAL_WORKFLOW_START_RE.lastIndex = 0;
    while ((m = TEMPORAL_WORKFLOW_START_RE.exec(content)) !== null) {
      out.push({
        filePath,
        role: 'workflow',
        queueName: m[2],
        method: m[1],
        lineNumber: content.substring(0, m.index).split('\n').length - 1,
      });
    }
  }
}
