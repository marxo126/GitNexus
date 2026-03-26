/**
 * tRPC procedure state slot detector.
 *
 * Detects tRPC router definitions (server-side) and client-side usage.
 *
 * Server-side pattern:
 *   export const appRouter = router({
 *     getVendors: publicProcedure.query(async () => { ... }),
 *     updateVendor: publicProcedure.input(...).mutation(async () => { ... }),
 *   });
 *
 * Client-side pattern:
 *   const { data } = trpc.getVendors.useQuery();
 *   const mutation = trpc.updateVendor.useMutation();
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer, ExtractedStateSlotConsumer } from './types.js';
import { lineNumberAt, findEnclosingFunctionName, findMatchingBrace } from './utils.js';

/**
 * Detect tRPC router procedure definitions.
 *
 * Matches patterns like:
 *   procedureName: publicProcedure.query(...)
 *   procedureName: protectedProcedure.input(...).mutation(...)
 *   procedureName: procedure.input(...).query(...)
 */
function detectRouterProcedures(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  // Look for router({ ... }) calls
  const routerPattern = /\brouter\s*\(\s*\{/g;
  let routerMatch: RegExpExecArray | null;

  while ((routerMatch = routerPattern.exec(source)) !== null) {
    const braceStart = source.indexOf('{', routerMatch.index);
    if (braceStart === -1) continue;

    // Find matching closing brace
    const braceEnd = findMatchingBrace(source, braceStart);
    if (braceEnd === -1) continue;

    const routerBody = source.slice(braceStart, braceEnd + 1);

    // Match procedure definitions: `name: xxxProcedure...query(` or `name: xxxProcedure...mutation(`
    // Use a line-by-line scan approach since the chained calls can span complex expressions
    const procPattern = /(\w+)\s*:\s*\w*[Pp]rocedure\b/g;
    let procMatch: RegExpExecArray | null;

    while ((procMatch = procPattern.exec(routerBody)) !== null) {
      const procedureName = procMatch[1];
      // Look ahead in the next ~500 chars for .query( or .mutation( to confirm this is a procedure
      const lookAhead = routerBody.slice(procMatch.index, procMatch.index + 500);
      if (!/\.(query|mutation)\s*\(/.test(lookAhead)) continue;
      const absolutePos = braceStart + procMatch.index;
      const lineNumber = lineNumberAt(source, absolutePos);

      const producer: ExtractedStateSlotProducer = {
        functionName: procedureName,
        filePath,
        lineNumber,
        keys: [],
        confidence: 'heuristic',
      };

      slots.push({
        name: `trpc.${procedureName}`,
        slotKind: 'trpc',
        cacheKey: procedureName,
        filePath,
        lineNumber,
        producers: [producer],
        consumers: [],
      });
    }
  }

  return slots;
}

/**
 * Detect tRPC client-side usage.
 *
 * Matches patterns like:
 *   trpc.getVendors.useQuery()
 *   trpc.updateVendor.useMutation()
 *   api.getVendors.useQuery()  (common alias)
 */
function detectClientUsage(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];

  // Match trpc.procedureName.useQuery/useMutation/useInfiniteQuery/useSuspenseQuery
  const clientPattern = /\b(\w+)\.(\w+)\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = clientPattern.exec(source)) !== null) {
    const clientVar = match[1];
    const procedureName = match[2];
    const hookType = match[3];

    // Heuristic: only match if the client variable looks like a trpc/api client
    // Skip obvious non-trpc objects (React, window, document, console, etc.)
    const skipVars = new Set(['React', 'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'Promise']);
    if (skipVars.has(clientVar)) continue;

    const lineNumber = lineNumberAt(source, match.index);
    const enclosingFn = findEnclosingFunctionName(source, match.index);

    const consumer: ExtractedStateSlotConsumer = {
      functionName: enclosingFn,
      filePath,
      lineNumber,
      accessedKeys: [],
      confidence: 'heuristic',
    };

    slots.push({
      name: `trpc.${procedureName}`,
      slotKind: 'trpc',
      cacheKey: procedureName,
      filePath,
      lineNumber,
      producers: [],
      consumers: [consumer],
    });
  }

  return slots;
}

/**
 * Detect tRPC state slots in a source file.
 *
 * Detects both server-side router definitions and client-side hook usage.
 *
 * @param source  Raw source text of the file
 * @param filePath  Absolute path to the file
 * @returns Array of ExtractedStateSlot records
 */
export function detectTRPCSlots(source: string, filePath: string): ExtractedStateSlot[] {
  return [
    ...detectRouterProcedures(source, filePath),
    ...detectClientUsage(source, filePath),
  ];
}
