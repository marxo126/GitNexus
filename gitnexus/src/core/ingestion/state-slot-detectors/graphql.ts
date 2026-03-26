/**
 * GraphQL query/fragment state slot detector.
 *
 * Detects GraphQL operations from:
 * 1. gql`` tagged template literals in .ts/.tsx/.js/.jsx files
 * 2. Raw .graphql / .gql files
 *
 * For each query/mutation, creates a StateSlot with:
 * - slotKind: 'graphql'
 * - cacheKey: operation name (e.g., 'GetVendors')
 * - keys: top-level field selections
 */

import type { ExtractedStateSlot, ExtractedStateSlotProducer } from './types.js';
import { lineNumberAt, findEnclosingFunctionName } from './utils.js';

/**
 * Parse a GraphQL document string to extract operations.
 * Returns array of { operationName, operationType, fields, offset }.
 */
interface GqlOperation {
  operationName: string;
  operationType: 'query' | 'mutation' | 'subscription';
  fields: string[];
  /** Character offset within the document string */
  offset: number;
}

function parseGraphQLOperations(gqlDoc: string): GqlOperation[] {
  const operations: GqlOperation[] = [];

  // Match: query Name { ... } or mutation Name(...) { ... } or subscription Name { ... }
  const opPattern = /\b(query|mutation|subscription)\s+(\w+)\s*(?:\([^)]*\))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = opPattern.exec(gqlDoc)) !== null) {
    const operationType = match[1] as GqlOperation['operationType'];
    const operationName = match[2];
    const braceStart = gqlDoc.indexOf('{', match.index + match[0].length - 1);
    if (braceStart === -1) continue;

    const fields = extractTopLevelFields(gqlDoc, braceStart);
    operations.push({
      operationName,
      operationType,
      fields,
      offset: match.index,
    });
  }

  return operations;
}

/**
 * Extract top-level field names from a GraphQL selection set.
 * Starting at the opening `{`, reads field names at depth 1.
 */
function extractTopLevelFields(doc: string, braceStart: number): string[] {
  const fields: string[] = [];
  let depth = 0;

  for (let i = braceStart; i < doc.length; i++) {
    const ch = doc[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1) {
      // At top level of selection set — look for field names
      // Skip whitespace and commas
      if (/\s/.test(ch) || ch === ',') continue;

      // Read a word (field name)
      if (/[a-zA-Z_]/.test(ch)) {
        let end = i + 1;
        while (end < doc.length && /[\w]/.test(doc[end])) end++;
        const word = doc.slice(i, end);
        // Skip GraphQL keywords that appear at field level
        if (!['__typename', 'on'].includes(word)) {
          // Check if this is an alias: `alias: fieldName`
          const afterWord = doc.slice(end).match(/^\s*:\s*(\w+)/);
          if (afterWord) {
            // This is an alias — use the alias name as the consumer-facing key
            // and skip past the colon + real field name
            fields.push(word);
            i = end + afterWord[0].length - 1;
          } else {
            fields.push(word);
            i = end - 1;
          }
        } else {
          i = end - 1; // skip past the keyword
        }
      }
    }
  }

  return [...new Set(fields)];
}

/**
 * Find the enclosing variable/const name for a gql`` tag at a given position.
 * Looks for `const NAME = gql`.
 */
function findGqlVariableName(source: string, pos: number): string | null {
  const before = source.slice(Math.max(0, pos - 200), pos);
  const constMatch = before.match(/(?:const|let|var|export\s+const)\s+(\w+)\s*=\s*(?:\/\*[^*]*\*\/\s*)?$/);
  return constMatch ? constMatch[1] : null;
}

/**
 * Detect GraphQL state slots from gql`` tagged template literals.
 *
 * @param source  Raw source text of the file
 * @param filePath  Absolute path to the file
 * @returns Array of ExtractedStateSlot records
 */
export function detectGraphQLSlots(source: string, filePath: string): ExtractedStateSlot[] {
  const slots: ExtractedStateSlot[] = [];
  const isGraphQLFile = /\.(graphql|gql)$/.test(filePath);

  if (isGraphQLFile) {
    // Parse the entire file as a GraphQL document
    const operations = parseGraphQLOperations(source);
    for (const op of operations) {
      const lineNumber = lineNumberAt(source, op.offset);

      const producer: ExtractedStateSlotProducer = {
        functionName: `${op.operationType}:${op.operationName}`,
        filePath,
        lineNumber,
        keys: op.fields,
        confidence: 'ast-literal',
      };

      slots.push({
        name: op.operationName,
        slotKind: 'graphql',
        cacheKey: op.operationName,
        filePath,
        lineNumber,
        producers: [producer],
        consumers: [],
      });
    }
  } else {
    // Search for gql`` tagged template literals
    const gqlTagPattern = /\bgql\s*`/g;
    let match: RegExpExecArray | null;

    while ((match = gqlTagPattern.exec(source)) !== null) {
      const templateStart = source.indexOf('`', match.index);
      if (templateStart === -1) continue;

      // Find the closing backtick (no interpolation expected in gql``)
      const templateEnd = source.indexOf('`', templateStart + 1);
      if (templateEnd === -1) continue;

      const gqlContent = source.slice(templateStart + 1, templateEnd);
      const operations = parseGraphQLOperations(gqlContent);

      for (const op of operations) {
        const lineNumber = lineNumberAt(source, match.index);
        const varName = findGqlVariableName(source, match.index);
        const enclosingFn = findEnclosingFunctionName(source, match.index);

        const producer: ExtractedStateSlotProducer = {
          functionName: varName ?? enclosingFn,
          filePath,
          lineNumber,
          keys: op.fields,
          confidence: 'ast-literal',
        };

        slots.push({
          name: op.operationName,
          slotKind: 'graphql',
          cacheKey: op.operationName,
          filePath,
          lineNumber,
          producers: [producer],
          consumers: [],
        });
      }
    }
  }

  return slots;
}
