# WCAG Accessibility Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WCAG 2.2 AA accessibility detection to GitNexus — extract JSX elements via tree-sitter, run 42 WCAG rules, produce per-page compliance reports via `wcag_audit` MCP tool.

**Architecture:** Tree-sitter extracts JSX elements/attributes during parse phase → WCAG rule engine checks elements against criteria → A11ySignal nodes stored in graph → `wcag_audit` tool queries graph for compliance score, violations, per-route matrix.

**Tech Stack:** TypeScript, tree-sitter (JSX extraction), LadybugDB (graph DB), vitest (tests), MCP protocol

**Spec:** `docs/superpowers/specs/2026-03-26-wcag-a11y-detection-design.md`

**Worktree:** `/private/tmp/gitnexus-wcag` (branch `feat/wcag-a11y-detection`)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/core/ingestion/a11y-rules/types.ts` | `WCAGRule`, `A11ySignal`, `ExtractedJSXElement`, `ComplianceTag` interfaces |
| `src/core/ingestion/a11y-rules/jsx-extractor.ts` | Parse tree-sitter JSX captures into `ExtractedJSXElement[]` |
| `src/core/ingestion/a11y-rules/perceivable/non-text-content.ts` | SC 1.1.1 rules: img-alt, icon-button-label |
| `src/core/ingestion/a11y-rules/perceivable/info-relationships.ts` | SC 1.3.1 rules: input-label, table-caption, heading-order, landmarks |
| `src/core/ingestion/a11y-rules/operable/keyboard.ts` | SC 2.1.1, 2.1.2 rules: keyboard, no-keyboard-trap |
| `src/core/ingestion/a11y-rules/operable/navigation.ts` | SC 2.4.1, 2.4.2 rules: bypass-blocks, page-titled |
| `src/core/ingestion/a11y-rules/understandable/language.ts` | SC 3.1.1 rule: language-page |
| `src/core/ingestion/a11y-rules/robust/name-role-value.ts` | SC 4.1.2, 4.1.3 rules: name-role-value, status-messages |
| `src/core/ingestion/a11y-rules/bonus/deaf-specific.ts` | video-captions rule |
| `src/core/ingestion/a11y-rules/index.ts` | Rule registry + `runA11yRules()` orchestrator |
| `src/core/ingestion/a11y-processor.ts` | Pipeline Phase 3.8: create A11ySignal nodes + HAS_A11Y_SIGNAL edges |
| `test/fixtures/a11y-seed.ts` | Cypher seed data for wcag_audit E2E tests |
| `test/unit/a11y-rules.test.ts` | Unit tests for all Phase 1 rules |
| `test/unit/jsx-extractor.test.ts` | Unit tests for JSX extraction |
| `test/integration/wcag-audit-e2e.test.ts` | E2E tests for wcag_audit tool |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/ingestion/tree-sitter-queries.ts` | Add JSX element/attribute capture queries to TS and JS strings |
| `src/core/ingestion/workers/parse-worker.ts` | Add `ExtractedJSXElement` to result, JSX capture dispatch |
| `src/core/ingestion/pipeline.ts` | Add Phase 3.8 (a11y detection), accumulate JSX elements |
| `src/core/graph/types.ts` | Add `A11ySignal` to NodeLabel, `HAS_A11Y_SIGNAL` to RelationshipType |
| `src/core/lbug/schema.ts` | Add A11Y_SIGNAL_SCHEMA, update NODE_TABLES, REL_TYPES, RELATION_SCHEMA |
| `src/core/lbug/csv-generator.ts` | Add a11ySignalWriter |
| `src/mcp/tools.ts` | Add `wcag_audit` tool definition |
| `src/mcp/local/local-backend.ts` | Add `wcagAudit()` method, `case 'wcag_audit'` in callTool() |
| `src/mcp/server.ts` | Add next-step hint for wcag_audit |
| `src/types/pipeline.ts` | Add `'a11y'` to PipelinePhase |

---

## Phase 1: Foundation (JSX Extraction + 10 Core Rules + wcag_audit Tool)

### Task 1: Add A11ySignal to Graph Types + LadybugDB Schema + CSV Generator

**Files:**
- Modify: `src/core/graph/types.ts`
- Modify: `src/core/lbug/schema.ts`
- Modify: `src/core/lbug/csv-generator.ts`

- [ ] **Step 1: Add A11ySignal to NodeLabel**

In `types.ts`, add after `'Tool'`:
```typescript
  | 'Tool'
  | 'A11ySignal';  // WCAG accessibility finding (violation/warning/pass)
```

- [ ] **Step 2: Add A11ySignal properties to NodeProperties**

After Route-specific properties:
```typescript
  // A11ySignal-specific
  criterion?: string;        // WCAG SC number (e.g., "1.1.1")
  signalStatus?: string;     // violation | warning | pass
  severity?: string;         // critical | serious | moderate | minor
  element?: string;          // JSX element tag (e.g., "img", "button")
  complianceTag?: string;    // eu-required | eu-recommended | wcag-aaa | deaf-specific
```

- [ ] **Step 3: Add HAS_A11Y_SIGNAL to RelationshipType**

After `'QUERIES'`:
```typescript
  | 'QUERIES'
  | 'HAS_A11Y_SIGNAL';  // Function/File -> A11ySignal
```

- [ ] **Step 4: Add to LadybugDB schema**

Add `'A11ySignal'` to NODE_TABLES, `'HAS_A11Y_SIGNAL'` to REL_TYPES.

Add schema constant after TOOL_SCHEMA:
```typescript
export const A11Y_SIGNAL_SCHEMA = `
CREATE NODE TABLE A11ySignal (
  id STRING,
  name STRING,
  filePath STRING,
  criterion STRING,
  signalStatus STRING,
  severity STRING,
  element STRING,
  startLine INT64,
  complianceTag STRING,
  PRIMARY KEY (id)
)`;
```

Add FROM/TO entries to RELATION_SCHEMA:
```typescript
  FROM Function TO A11ySignal,
  FROM Method TO A11ySignal,
  FROM File TO A11ySignal,
```

Add A11Y_SIGNAL_SCHEMA to NODE_SCHEMA_QUERIES.

- [ ] **Step 5: Add CSV writer**

In csv-generator.ts, add:
```typescript
const a11ySignalWriter = new BufferedCSVWriter(path.join(csvDir, 'a11ysignal.csv'), 'id,name,filePath,criterion,signalStatus,severity,element,startLine,complianceTag');
```

Add `case 'A11ySignal':` to switch block, add to allWriters and tableMap.

- [ ] **Step 6: Commit**

```bash
HUSKY=0 git commit -m "feat(schema): add A11ySignal node type and HAS_A11Y_SIGNAL relationship"
```

---

### Task 2: Create A11y Types

**Files:**
- Create: `src/core/ingestion/a11y-rules/types.ts`

- [ ] **Step 1: Write types**

```typescript
/**
 * Types for WCAG accessibility detection.
 */

export type SignalStatus = 'violation' | 'warning' | 'pass';
export type SignalSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type SignalConfidence = 'definite' | 'likely' | 'heuristic';
export type ComplianceTag = 'eu-required' | 'eu-recommended' | 'wcag-aaa' | 'deaf-specific';

export interface ExtractedJSXElement {
  tag: string;
  filePath: string;
  lineNumber: number;
  attributes: Map<string, string | true>;
  hasChildren: boolean;
  textContent?: string;
  enclosingFunction: string;
  parentTag?: string;
  classNames?: string[];
}

export interface A11ySignal {
  name: string;
  criterion: string;
  status: SignalStatus;
  severity: SignalSeverity;
  element: string;
  filePath: string;
  startLine: number;
  confidence: SignalConfidence;
  complianceTag: ComplianceTag;
}

export interface WCAGRule {
  id: string;
  criterion: string;
  wcagName: string;
  severity: SignalSeverity;
  complianceTag: ComplianceTag;
  check: (elements: ExtractedJSXElement[], filePath: string) => A11ySignal[];
}
```

- [ ] **Step 2: Commit**

```bash
HUSKY=0 git commit -m "feat(types): add A11ySignal, ExtractedJSXElement, WCAGRule interfaces"
```

---

### Task 3: Add JSX Tree-Sitter Queries + Extraction

**Files:**
- Modify: `src/core/ingestion/tree-sitter-queries.ts`
- Create: `src/core/ingestion/a11y-rules/jsx-extractor.ts`
- Modify: `src/core/ingestion/workers/parse-worker.ts`
- Create: `test/unit/jsx-extractor.test.ts`

- [ ] **Step 1: Add JSX queries to TYPESCRIPT_QUERIES**

Before the closing backtick of TYPESCRIPT_QUERIES (line ~136), add:

```
; JSX self-closing elements: <img />, <input />, <br />
(jsx_self_closing_element
  name: (identifier) @jsx.tag) @jsx.self_closing

; JSX opening elements: <div>, <button>, <a>
(jsx_opening_element
  name: (identifier) @jsx.tag) @jsx.opening

; JSX attributes: alt="text", onClick={handler}, aria-label="..."
(jsx_attribute
  (property_identifier) @jsx.attr.name
  [(string (string_fragment) @jsx.attr.value)
   (jsx_expression) @jsx.attr.expr]?) @jsx.attribute
```

Add the same queries to JAVASCRIPT_QUERIES before its closing backtick.

**Note:** Tree-sitter JSX captures are separate matches from the element captures. The JSX extractor (next step) will post-process these by correlating attributes to their parent elements using line positions.

- [ ] **Step 2: Write JSX extractor**

Create `src/core/ingestion/a11y-rules/jsx-extractor.ts`:

```typescript
/**
 * Extract JSX elements with their attributes from tree-sitter captures.
 *
 * Tree-sitter captures JSX elements and attributes as separate matches.
 * This module correlates them by line position into ExtractedJSXElement objects.
 */

import type { ExtractedJSXElement } from './types.js';

interface RawJSXCapture {
  type: 'self_closing' | 'opening';
  tag: string;
  startLine: number;
  endLine: number;
  startIndex: number;
  endIndex: number;
}

interface RawJSXAttribute {
  name: string;
  value: string | true;  // true = attribute present but value is expression
  parentStartLine: number;
}

/**
 * Build ExtractedJSXElement[] from raw captures accumulated during parse.
 */
export function buildJSXElements(
  elements: RawJSXCapture[],
  attributes: RawJSXAttribute[],
  filePath: string,
  source: string,
  enclosingFunctions: Map<number, string>,  // lineNumber -> functionName
): ExtractedJSXElement[] {
  // Group attributes by their parent element's start line
  const attrsByLine = new Map<number, RawJSXAttribute[]>();
  for (const attr of attributes) {
    const arr = attrsByLine.get(attr.parentStartLine) || [];
    arr.push(attr);
    attrsByLine.set(attr.parentStartLine, arr);
  }

  const result: ExtractedJSXElement[] = [];

  for (const el of elements) {
    const attrs = new Map<string, string | true>();
    const elAttrs = attrsByLine.get(el.startLine) || [];
    for (const a of elAttrs) {
      attrs.set(a.name, a.value);
    }

    // Extract className into classNames array
    let classNames: string[] | undefined;
    const className = attrs.get('className');
    if (typeof className === 'string') {
      classNames = className.split(/\s+/).filter(Boolean);
    }

    // Check for text content (simple heuristic: look between opening and closing tags)
    let textContent: string | undefined;
    let hasChildren = false;
    if (el.type === 'opening') {
      // Look for text between this element's end and the next tag
      const afterOpen = source.substring(el.endIndex, Math.min(el.endIndex + 200, source.length));
      const textMatch = afterOpen.match(/^>([^<]+)</);
      if (textMatch && textMatch[1].trim()) {
        textContent = textMatch[1].trim();
        hasChildren = true;
      } else if (afterOpen.match(/^>[^]*?<\//)) {
        hasChildren = true;
      }
    }

    // Find enclosing function
    let enclosingFunction = '<module>';
    for (const [line, name] of enclosingFunctions) {
      if (line <= el.startLine) {
        enclosingFunction = name;
      }
    }

    result.push({
      tag: el.tag,
      filePath,
      lineNumber: el.startLine,
      attributes: attrs,
      hasChildren,
      textContent,
      enclosingFunction,
      classNames,
    });
  }

  return result;
}

export type { RawJSXCapture, RawJSXAttribute };
```

- [ ] **Step 3: Add JSX capture handling to parse-worker.ts**

Add `ExtractedJSXElement` to `ParseWorkerResult`:
```typescript
  jsxElements: ExtractedJSXElement[];
```

In the capture dispatch loop, add before the `call` handling:

```typescript
// JSX element captures
if (captureMap['jsx.self_closing'] && captureMap['jsx.tag']) {
  const tag = captureMap['jsx.tag'].text;
  const node = captureMap['jsx.self_closing'];
  rawJSXElements.push({
    type: 'self_closing',
    tag,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
  });
  continue;
}

if (captureMap['jsx.opening'] && captureMap['jsx.tag']) {
  const tag = captureMap['jsx.tag'].text;
  const node = captureMap['jsx.opening'];
  rawJSXElements.push({
    type: 'opening',
    tag,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
  });
  continue;
}

if (captureMap['jsx.attribute'] && captureMap['jsx.attr.name']) {
  const name = captureMap['jsx.attr.name'].text;
  const valueNode = captureMap['jsx.attr.value'];
  const exprNode = captureMap['jsx.attr.expr'];
  const attrNode = captureMap['jsx.attribute'];
  rawJSXAttributes.push({
    name,
    value: valueNode ? valueNode.text : (exprNode ? true : true),
    parentStartLine: attrNode.startPosition.row + 1,
  });
  continue;
}
```

After the file processing loop, build the elements:
```typescript
if (rawJSXElements.length > 0) {
  const jsxElements = buildJSXElements(rawJSXElements, rawJSXAttributes, file.path, file.content, enclosingFunctions);
  result.jsxElements.push(...jsxElements);
}
```

- [ ] **Step 4: Write JSX extractor tests**

Create `test/unit/jsx-extractor.test.ts` with tests for:
- Self-closing element extraction (`<img alt="photo" />`)
- Opening element with children (`<button>Click</button>`)
- Attribute parsing (string values, expression values, boolean attributes)
- className parsing into classNames array
- Text content extraction
- Multiple elements in same file

- [ ] **Step 5: Run tests and commit**

```bash
npx vitest run test/unit/jsx-extractor.test.ts
HUSKY=0 git commit -m "feat: add JSX tree-sitter queries and element extraction"
```

---

### Task 4: Write Phase 1 WCAG Rules (10 rules)

**Files:**
- Create: `src/core/ingestion/a11y-rules/perceivable/non-text-content.ts`
- Create: `src/core/ingestion/a11y-rules/perceivable/info-relationships.ts`
- Create: `src/core/ingestion/a11y-rules/operable/keyboard.ts`
- Create: `src/core/ingestion/a11y-rules/operable/navigation.ts`
- Create: `src/core/ingestion/a11y-rules/understandable/language.ts`
- Create: `src/core/ingestion/a11y-rules/robust/name-role-value.ts`
- Create: `src/core/ingestion/a11y-rules/bonus/deaf-specific.ts`
- Create: `src/core/ingestion/a11y-rules/index.ts`
- Create: `test/unit/a11y-rules.test.ts`

- [ ] **Step 1: Write non-text-content rules (SC 1.1.1)**

Two rules: `img-alt` and `icon-button-label`.

`img-alt`: For each element with `tag === 'img'`, check for `alt` or `aria-label` or `aria-labelledby` attribute. Missing = violation (critical).

`icon-button-label`: For each element with `tag === 'button'` and `hasChildren === false` and no `textContent`, check for `aria-label` or `aria-labelledby`. Missing = violation (critical).

- [ ] **Step 2: Write info-relationships rules (SC 1.3.1)**

Two rules: `input-label` and `landmarks`.

`input-label`: For each `input`/`select`/`textarea` element, check for `aria-label`, `aria-labelledby`, or `id` matching a `label[htmlFor]` in the same file. Missing = violation (critical).

`landmarks`: Check if file contains `main`, `nav`, or `header` elements. Absence in files that look like layouts/pages = warning (serious).

- [ ] **Step 3: Write keyboard rules (SC 2.1.1, 2.1.2)**

`keyboard`: For each `div`/`span` with `onClick` but no `onKeyDown`/`onKeyUp`/`onKeyPress` and no `role`, flag as violation (critical).

`no-keyboard-trap`: For files containing focus trap patterns (useFocusTrap, createFocusTrap), check if Escape key handler exists. Regex-based on source text. Missing = violation (critical).

- [ ] **Step 4: Write navigation rules (SC 2.4.1, 2.4.2)**

`bypass-blocks`: Check layout files for skip link patterns (`<a href="#main"`, `sr-only`). Missing in layout = violation (serious).

`page-titled`: Check page files for `<title>`, `<Head>`, or `metadata` export. Missing = violation (serious).

- [ ] **Step 5: Write language rule (SC 3.1.1)**

`language-page`: Check root layout/html files for `lang` attribute on `<html>`. Missing = violation (serious).

- [ ] **Step 6: Write name-role-value rules (SC 4.1.2, 4.1.3)**

`name-role-value`: For `div`/`span` with `onClick` or `onKeyDown`, check for `role` attribute. Missing = violation (critical).

`status-messages`: For elements with dynamic content patterns (loading states, toast, alert), check for `aria-live` or `role="status"`/`role="alert"`. Missing = violation (serious).

- [ ] **Step 7: Write deaf-specific rule**

`video-captions`: For `video` elements, check for `<track kind="captions">` child or `track` attribute. Missing = violation (critical, deaf-specific tag).

- [ ] **Step 8: Write rule registry**

Create `src/core/ingestion/a11y-rules/index.ts`:

```typescript
import type { WCAGRule, ExtractedJSXElement, A11ySignal } from './types.js';
import { imgAlt, iconButtonLabel } from './perceivable/non-text-content.js';
import { inputLabel, landmarks } from './perceivable/info-relationships.js';
import { keyboard, noKeyboardTrap } from './operable/keyboard.js';
import { bypassBlocks, pageTitled } from './operable/navigation.js';
import { languagePage } from './understandable/language.js';
import { nameRoleValue, statusMessages } from './robust/name-role-value.js';
import { videoCaptions } from './bonus/deaf-specific.js';

export type { WCAGRule, A11ySignal, ExtractedJSXElement } from './types.js';

const RULES: WCAGRule[] = [
  imgAlt, iconButtonLabel,
  inputLabel, landmarks,
  keyboard, noKeyboardTrap,
  bypassBlocks, pageTitled,
  languagePage,
  nameRoleValue, statusMessages,
  videoCaptions,
];

export function runA11yRules(elements: ExtractedJSXElement[], filePath: string): A11ySignal[] {
  const signals: A11ySignal[] = [];
  for (const rule of RULES) {
    signals.push(...rule.check(elements, filePath));
  }
  return signals;
}

export { RULES };
```

- [ ] **Step 9: Write rule tests**

Create `test/unit/a11y-rules.test.ts` with tests for all 10 rules:
- img without alt → violation
- img with alt → no signal
- button without text or aria-label → violation
- input without label → violation
- div with onClick but no onKeyDown → violation
- div with onClick and onKeyDown → no signal
- layout without skip link → violation
- video without captions track → violation
- Each test creates mock `ExtractedJSXElement[]` and asserts on returned `A11ySignal[]`

- [ ] **Step 10: Run tests and commit**

```bash
npx vitest run test/unit/a11y-rules.test.ts
HUSKY=0 git commit -m "feat: add 10 core WCAG rules (Phase 1)"
```

---

### Task 5: Create A11y Processor (Pipeline Phase 3.8)

**Files:**
- Create: `src/core/ingestion/a11y-processor.ts`
- Modify: `src/core/ingestion/pipeline.ts`
- Modify: `src/types/pipeline.ts`

- [ ] **Step 1: Write a11y-processor.ts**

Creates A11ySignal nodes and HAS_A11Y_SIGNAL edges from detected signals.

```typescript
import type { A11ySignal } from './a11y-rules/types.js';

function generateId(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

export interface A11yProcessorResult {
  signalsCreated: number;
  edgesCreated: number;
  violations: number;
  warnings: number;
}

export function processA11ySignals(
  signals: A11ySignal[],
  graph: any,
): A11yProcessorResult {
  const stats = { signalsCreated: 0, edgesCreated: 0, violations: 0, warnings: 0 };

  for (const signal of signals) {
    const signalId = generateId('A11ySignal', `${signal.filePath}:${signal.startLine}:${signal.criterion}`);

    graph.addNode({
      id: signalId,
      label: 'A11ySignal',
      properties: {
        name: signal.name,
        filePath: signal.filePath,
        criterion: signal.criterion,
        signalStatus: signal.status,
        severity: signal.severity,
        element: signal.element,
        startLine: signal.startLine,
        complianceTag: signal.complianceTag,
      },
    });
    stats.signalsCreated++;
    if (signal.status === 'violation') stats.violations++;
    if (signal.status === 'warning') stats.warnings++;

    // Find the enclosing function/file node to create HAS_A11Y_SIGNAL edge
    const fileId = generateId('File', signal.filePath);
    const edgeId = generateId('HAS_A11Y_SIGNAL', `${fileId}->${signalId}`);
    graph.addRelationship({
      id: edgeId,
      sourceId: fileId,
      targetId: signalId,
      type: 'HAS_A11Y_SIGNAL',
      confidence: signal.confidence === 'definite' ? 1.0 : signal.confidence === 'likely' ? 0.8 : 0.6,
      reason: `wcag|${signal.criterion}|${signal.status}`,
    });
    stats.edgesCreated++;
  }

  return stats;
}
```

- [ ] **Step 2: Integrate into pipeline.ts**

Add imports, accumulator for JSX elements, Phase 3.8 block after Phase 3.7:

```typescript
// Phase 3.8: A11y Detection
if (allJSXElements.length > 0) {
  const a11ySignals = runA11yRules(allJSXElements, '');  // filePath is on each element
  if (a11ySignals.length > 0) {
    const a11yResult = processA11ySignals(a11ySignals, graph);
    if (isDev) {
      console.log(`♿ A11y: ${a11yResult.signalsCreated} signals (${a11yResult.violations} violations, ${a11yResult.warnings} warnings)`);
    }
  }
}
```

Add `'a11y'` to PipelinePhase in `src/types/pipeline.ts`.

- [ ] **Step 3: Commit**

```bash
HUSKY=0 git commit -m "feat: add a11y processor and pipeline phase 3.8 integration"
```

---

### Task 6: Create wcag_audit MCP Tool

**Files:**
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/local/local-backend.ts`
- Modify: `src/mcp/server.ts`
- Create: `test/fixtures/a11y-seed.ts`
- Create: `test/integration/wcag-audit-e2e.test.ts`

- [ ] **Step 1: Add tool definition**

Add to GITNEXUS_TOOLS in tools.ts:

```typescript
{
  name: 'wcag_audit',
  description: `WCAG 2.2 AA accessibility audit for indexed repositories.

WHEN TO USE: When you need to check accessibility compliance, find WCAG violations, or get a compliance score for a page/route/component.

Returns: compliance score (% criteria met), violation list with fix patterns from the codebase, and per-route compliance matrix. Each finding includes EU compliance tags.

AFTER THIS: Use \`context\` on violating components to see usage, or \`impact\` to check how many pages are affected.`,
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'string', description: 'Filter by route path' },
      criterion: { type: 'string', description: 'Filter by WCAG criterion (e.g., "1.1.1")' },
      status: { type: 'string', description: 'Filter by status: "violation" or "warning"' },
      component: { type: 'string', description: 'Filter by component name' },
      repo: { type: 'string', description: 'Repository name or path.' },
    },
    required: [],
  },
},
```

- [ ] **Step 2: Implement wcagAudit() method**

Add `case 'wcag_audit': return this.wcagAudit(repo, params);` to callTool() switch.

Implement `wcagAudit()`:
1. Query A11ySignal nodes with optional filters
2. Group by criterion → compute compliance score
3. For each violation, search for components that pass the same criterion → fix pattern
4. Group by route (via Route → File → HAS_A11Y_SIGNAL chain) → per-route matrix
5. Return `{ score, findings, routes, total }`

- [ ] **Step 3: Create seed data**

Seed with: File nodes, Function nodes, A11ySignal nodes (mix of violations and passes), HAS_A11Y_SIGNAL edges, Route nodes with HANDLES_ROUTE edges.

- [ ] **Step 4: Write E2E tests**

Test cases:
1. Returns compliance score
2. Filters by criterion
3. Filters by status (violations only)
4. Returns fix patterns for violations
5. Per-route matrix
6. Compliance tags present on all findings

- [ ] **Step 5: Add next-step hint in server.ts**

- [ ] **Step 6: Commit**

```bash
HUSKY=0 git commit -m "feat(mcp): add wcag_audit tool with compliance scoring and fix patterns"
```

---

### Task 7: Run Full Test Suite + Fix Breakages

- [ ] **Step 1: Run `npx tsc --noEmit`**
- [ ] **Step 2: Run `npx vitest run`**
- [ ] **Step 3: Fix count-based assertion breakages in schema.test.ts, security.test.ts, tools.test.ts**
- [ ] **Step 4: Commit fixes**

---

## Phase 2: Full WCAG 2.2 AA Rule Coverage (Outline)

### Task 8-11: Remaining Perceivable Rules
- table-caption, heading-order, meaningful-sequence, orientation, input-purpose
- Tailwind resolver utility for contrast, resize-text, text-spacing
- Tests for each rule

### Task 12-15: Remaining Operable Rules
- link-purpose, headings-labels, focus-not-obscured, focus-appearance
- dragging, target-size, target-size-enhanced, motion-preference
- Tests for each rule

### Task 16-17: Remaining Understandable Rules
- language-parts, consistent-help, error-identification
- labels-instructions, redundant-entry, accessible-auth, accessible-auth-enhanced
- Tests for each rule

### Task 18: Remaining Robust Rules
- duplicate-id, custom-select
- Tests

### Task 19: Remaining Deaf-Specific Rules
- audio-alternative, sign-language-alt, visual-notification
- Tests

### Task 20: Per-Route Compliance Matrix + Fix Patterns + Compliance Tags
- Enhance wcag_audit output with full per-route matrix
- Fix pattern search across codebase
- Compliance tags on all findings
- Real-repo validation on fluentiagrant-app

---

## Phase 3: Tool Integration + Graph-Enhanced Rules (Outline)

### Task 21: Extend detect_changes
- After mapping diff to symbols, also query A11ySignals on affected files
- Report affected WCAG criteria

### Task 22: Extend impact and context
- impact: when BFS reaches component with A11ySignals, include them
- context: show a11y signals in 360-degree view

### Task 23: Graph-Enhanced Rules
- bypass-blocks per page (trace route → layout → skip link)
- consistent-help (check help component presence across all routes)
- landmark completeness (assemble full page from route → layout → components)

### Task 24: Cross-Project Pattern Matching
- Search other indexed repos for passing patterns when current repo has violations

---

## Testing Strategy

### Seed-Based Tests (per rule)
- Mock ExtractedJSXElement[] with violations → assert A11ySignal returned
- Mock elements without violations → assert empty
- Break fixture to verify test catches

### Pipeline-Level Tests
- Synthetic TSX files in test/fixtures/a11y-mini-repo/
- Run pipeline, assert A11ySignal nodes created

### Real-Repo Validation
- fluentiagrant-app (rich a11y — verify detection matches existing audit)
- collector (PHP — zero false positives on non-JSX)

### MCP Tool Smoke Tests
- Invoke wcag_audit after each phase

## Post-Implementation Process (every phase)

1. Run /simplify on the branch
2. Real-repo validation
3. Squash duplicate commits
4. Audit PR body for private project references
5. Push to fork and create PR
