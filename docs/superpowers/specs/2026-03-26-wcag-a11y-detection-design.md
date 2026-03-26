# WCAG Accessibility Detection for GitNexus

**Date:** 2026-03-26
**Status:** Approved
**Approach:** Hybrid — Tree-sitter JSX extraction + structured WCAG rule engine
**Target:** WCAG 2.2 AA (EN 301 549 compatible)

## Problem

GitNexus analyzes code structure, call graphs, and data flow, but has no awareness of accessibility. When an AI agent is asked to fix a11y issues, it must read dozens of files to understand the component tree, guess at patterns, and has no way to know which WCAG criteria are met or violated. This wastes tokens and produces unreliable fixes.

Meanwhile, EU-funded projects (like those in this workspace) must comply with EN 301 549 which references WCAG 2.1 AA, with WCAG 2.2 AA expected as the upcoming standard.

## Goals

1. **Index a11y signals** during pipeline analysis — extract JSX elements, attributes, ARIA patterns, store in graph
2. **Map to WCAG 2.2 AA criteria** — 42 detectable rules covering perceivable, operable, understandable, robust principles
3. **Provide AI agent context** — structured findings with fix patterns from the same codebase, reducing token usage by ~90%
4. **Per-route compliance reporting** — compliance score, violation list, per-route matrix via `wcag_audit` MCP tool
5. **A11y regression detection** — integrate with `detect_changes` and `impact` tools
6. **Informational, not blocking** — all findings always shown, teams decide what to act on

## Non-Goals

- Runtime testing (color contrast rendering, screen reader behavior, focus order testing)
- CSS file parsing (Tailwind classes in JSX are in scope; standalone .css files are not)
- Third-party component internals (trust Radix, MUI, etc. are accessible)
- Build/CI blocking or enforcement

## Graph Model

### New Node: `A11ySignal`

Represents a detected accessibility signal on a specific element in a component.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Human-readable (e.g., `"img missing alt"`, `"button has aria-label"`) |
| `criterion` | string | WCAG SC number (e.g., `"1.1.1"`, `"2.1.1"`) |
| `status` | enum | `violation` \| `warning` \| `pass` |
| `severity` | enum | `critical` \| `serious` \| `moderate` \| `minor` |
| `element` | string | JSX element tag (e.g., `"img"`, `"button"`, `"div"`) |
| `filePath` | string | Source file |
| `startLine` | number | Line of the element |
| `confidence` | enum | `definite` \| `likely` \| `heuristic` |
| `complianceTag` | enum | `eu-required` \| `eu-recommended` \| `wcag-aaa` \| `deaf-specific` |

### New Edge: `HAS_A11Y_SIGNAL` (Function/File → A11ySignal)

Connects a component to its a11y signals.

| Property | Type | Description |
|----------|------|-------------|
| `confidence` | number | 0-1 |
| `reason` | string | Detection method (e.g., `"tree-sitter\|missing-alt"`) |

### Query Path

```
Route → HANDLES_ROUTE → File → CONTAINS → Function (component)
                                              ↓
                                        HAS_A11Y_SIGNAL
                                              ↓
                                         A11ySignal
```

Per-page compliance = follow the route chain, collect all A11ySignals, group by criterion.

## JSX Extraction Layer

### ExtractedJSXElement interface

```typescript
interface ExtractedJSXElement {
  tag: string;                              // "img", "button", "div", "input", "a", "video"
  filePath: string;
  lineNumber: number;
  attributes: Map<string, string | true>;   // { alt: "photo", onClick: true, role: "button" }
  hasChildren: boolean;                     // <button>Click me</button> vs <button />
  textContent?: string;                     // Direct text children
  enclosingFunction: string;                // Which component this element lives in
  parentTag?: string;                       // Immediate parent element
  classNames?: string[];                    // Parsed from className="..."
  inlineStyles?: Map<string, string>;       // Parsed from style={{...}}
}
```

### Tree-sitter queries

New queries added to `TYPESCRIPT_QUERIES` and `JAVASCRIPT_QUERIES` for TSX/JSX grammars:

- `jsx_self_closing_element` with tag name and attributes
- `jsx_opening_element` with tag name and attributes
- `jsx_attribute` with name and value (string, expression, or absent)
- `jsx_text` for text content children

### Pipeline integration

Extracted during existing Phase 3 (parse worker), accumulated alongside `allFetchCalls` and `allStateSlots`. Only for `.tsx`, `.jsx` files.

### What's NOT extracted

- Standalone CSS files (Tailwind classes in JSX classNames ARE extracted)
- Runtime-computed attribute values (`aria-label={condition ? "a" : "b"}` — we detect the attribute exists, can't resolve the value, confidence: `heuristic`)
- Third-party component internals

## WCAG Rule Engine

### Rule interface

```typescript
type WCAGRule = {
  id: string;              // "img-alt"
  criterion: string;       // "1.1.1"
  name: string;            // "Non-text Content"
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  complianceTag: 'eu-required' | 'eu-recommended' | 'wcag-aaa' | 'deaf-specific';
  check: (elements: ExtractedJSXElement[], filePath: string) => A11ySignal[];
};
```

### Rules by WCAG Principle

#### Principle 1: Perceivable (12 rules)

| Rule ID | WCAG SC | Name | Severity | Tag | Detection |
|---------|---------|------|----------|-----|-----------|
| `img-alt` | 1.1.1 | Non-text Content | critical | eu-required | img without alt or aria-label |
| `icon-button-label` | 1.1.1 | Non-text Content | critical | eu-required | button without text and without aria-label |
| `input-label` | 1.3.1 | Info and Relationships | critical | eu-required | input without associated label or aria-label |
| `table-caption` | 1.3.1 | Info and Relationships | serious | eu-required | table without caption |
| `heading-order` | 1.3.1 | Info and Relationships | moderate | eu-required | heading hierarchy skip (h1→h3) |
| `landmarks` | 1.3.1 | Info and Relationships | serious | eu-required | missing main/nav/header landmarks |
| `meaningful-sequence` | 1.3.2 | Meaningful Sequence | moderate | eu-required | CSS order property without tabIndex adjustment |
| `orientation` | 1.3.4 | Orientation | minor | eu-required | Forced orientation CSS without alternative |
| `input-purpose` | 1.3.5 | Identify Input Purpose | minor | eu-required | Form inputs without autocomplete |
| `contrast` | 1.4.3 | Contrast (Minimum) | serious | eu-required | Known low-contrast Tailwind class pairs |
| `resize-text` | 1.4.4 | Resize Text | moderate | eu-required | Fixed px font sizes instead of rem/em |
| `text-spacing` | 1.4.12 | Text Spacing | minor | eu-required | Hardcoded line-height/letter-spacing in fixed units |

#### Principle 2: Operable (12 rules)

| Rule ID | WCAG SC | Name | Severity | Tag | Detection |
|---------|---------|------|----------|-----|-----------|
| `keyboard` | 2.1.1 | Keyboard | critical | eu-required | onClick without onKeyDown on non-interactive element |
| `no-keyboard-trap` | 2.1.2 | No Keyboard Trap | critical | eu-required | Focus trap without Escape key handler |
| `bypass-blocks` | 2.4.1 | Bypass Blocks | serious | eu-required | Missing skip link in layout |
| `page-titled` | 2.4.2 | Page Titled | serious | eu-required | Route/page without title |
| `link-purpose` | 2.4.4 | Link Purpose | moderate | eu-required | Link with generic text ("click here") without aria-label |
| `headings-labels` | 2.4.6 | Headings and Labels | moderate | eu-required | Empty headings, form groups without legend |
| `focus-not-obscured` | 2.4.11 | Focus Not Obscured | moderate | eu-required | Sticky elements that could cover focused elements |
| `focus-appearance` | 2.4.13 | Focus Appearance | moderate | eu-required | Missing focus-visible styles |
| `dragging` | 2.5.7 | Dragging Movements | serious | eu-required | onDrag without non-dragging alternative |
| `target-size` | 2.5.5 | Target Size (Minimum) | moderate | eu-required | Interactive elements with explicit small dimensions |
| `target-size-enhanced` | 2.5.8 | Target Size (Enhanced) | minor | wcag-aaa | Touch targets below 44x44px |
| `motion-preference` | — | Reduced Motion | moderate | eu-recommended | Animation without prefers-reduced-motion check |

#### Principle 3: Understandable (8 rules)

| Rule ID | WCAG SC | Name | Severity | Tag | Detection |
|---------|---------|------|----------|-----|-----------|
| `language-page` | 3.1.1 | Language of Page | serious | eu-required | Missing lang attribute on html |
| `language-parts` | 3.1.2 | Language of Parts | moderate | eu-required | Hardcoded strings in i18n apps (should use t()) |
| `consistent-help` | 3.2.6 | Consistent Help | minor | eu-required | Help/contact component presence across pages |
| `error-identification` | 3.3.1 | Error Identification | serious | eu-required | Form error not linked via aria-describedby |
| `labels-instructions` | 3.3.2 | Labels or Instructions | moderate | eu-required | Required fields without indication |
| `redundant-entry` | 3.3.7 | Redundant Entry | minor | eu-required | Same field asked twice without pre-fill |
| `accessible-auth` | 3.3.8 | Accessible Authentication | serious | eu-required | CAPTCHA without alternative |
| `accessible-auth-enhanced` | 3.3.9 | Accessible Auth (Enhanced) | moderate | wcag-aaa | Password-only without passkey/OAuth option |

#### Principle 4: Robust (4 rules)

| Rule ID | WCAG SC | Name | Severity | Tag | Detection |
|---------|---------|------|----------|-----|-----------|
| `duplicate-id` | 4.1.1 | Parsing | moderate | eu-required | Duplicate id attributes in same component tree |
| `name-role-value` | 4.1.2 | Name, Role, Value | critical | eu-required | Custom widgets without role, aria-expanded, aria-selected |
| `status-messages` | 4.1.3 | Status Messages | serious | eu-required | Dynamic content updates without aria-live |
| `custom-select` | 4.1.2 | Name, Role, Value | serious | eu-required | Custom select/dropdown without listbox role |

#### Bonus: Deaf-Specific (4 rules)

| Rule ID | WCAG SC | Name | Severity | Tag | Detection |
|---------|---------|------|----------|-----|-----------|
| `video-captions` | 1.2.2 | Captions (Prerecorded) | critical | deaf-specific | video element without track[kind=captions] |
| `audio-alternative` | 1.2.1 | Audio-only Alternative | serious | deaf-specific | Audio feedback pattern without visual alternative |
| `sign-language-alt` | 1.2.6 | Sign Language | moderate | deaf-specific | Sign language video without text alternative |
| `visual-notification` | — | Visual Notifications | moderate | deaf-specific | Notification/alert relying on sound only |

#### Tailwind CSS Resolution (6 rules use this)

| Rule | What Tailwind resolver does |
|------|---------------------------|
| `contrast` | Map `text-{color}` + `bg-{color}` → hex values → calculate contrast ratio |
| `resize-text` | Map `text-{size}` → check if px-based |
| `text-spacing` | Map `leading-{n}` / `tracking-{n}` → check if fixed units |
| `target-size` | Map `w-{n} h-{n}` → check pixel dimensions on interactive elements |
| `target-size-enhanced` | Same as above with stricter 44px threshold |
| `focus-appearance` | Check for `focus:` / `focus-visible:` ring/outline classes |

**Total: 42 rules** (36 WCAG 2.2 AA + 2 WCAG AAA + 4 deaf-specific)

### Rule complexity categories

| Category | What it checks | When it runs |
|----------|---------------|-------------|
| Simple attribute check | "Does element X have attribute Y?" | Pipeline (Phase 3.8) |
| Attribute + context | "Has onClick but no onKeyDown on same element?" | Pipeline (Phase 3.8) |
| Cross-element | "Input has id=X, is there a label with htmlFor=X?" | Pipeline (Phase 3.8) |
| Tailwind resolution | Parse className, resolve values, check thresholds | Pipeline (Phase 3.8) |
| Graph-enhanced | Bypass blocks per page, consistent help, landmark completeness | Query time (wcag_audit tool) |

## MCP Tool: `wcag_audit`

### Input

| Param | Type | Description |
|-------|------|-------------|
| `route` | string? | Filter by route |
| `criterion` | string? | Filter by WCAG SC number |
| `status` | string? | `"violation"` \| `"warning"` — default: show all |
| `component` | string? | Filter by component name |
| `repo` | string? | Repository slug |

### Output

Three views in one response:

**1. Compliance score**
```
WCAG 2.2 AA: 83% (35/42 criteria met)
  Perceivable: 9/12 — Operable: 11/12 — Understandable: 8/10 — Robust: 7/8
```

**2. Violation list with fix patterns**
```
Findings (14):
  SC 1.1.1 (Non-text Content) — 2 findings [EU: Required by EN 301 549]
    FileUpload.tsx:42 — img button without aria-label
      Fix pattern: src/components/ui/button.tsx:89
    GrantCard.tsx:15 — img with empty alt=""
      Fix pattern: src/features/grants/components/GrantHeader.tsx:8

  SC 2.1.1 (Keyboard) — 1 finding [EU: Required by EN 301 549]
    KanbanCard.tsx:18 — div with onClick, no keyboard handler
      Fix pattern: src/features/tasks/components/TaskCard.tsx:24
```

**3. Per-route compliance matrix**
```
Route /grants/[slug]:
  Components: GrantForm, BudgetTable, FileUpload, StatusBadge
  SC 1.1.1: 1 finding (FileUpload)
  SC 1.3.1: 1 finding (BudgetTable missing caption)
  SC 2.1.1: clean
  SC 3.1.2: 2 findings (hardcoded strings)
```

### Compliance tags on every finding

| Tag | Meaning |
|-----|---------|
| `EU: Required by EN 301 549` | Part of WCAG 2.2 AA — mandatory for EU compliance |
| `EU: Recommended` | Best practice referenced in European Accessibility Act guidance |
| `WCAG AAA` | Beyond AA — exceeds EU minimum |
| `Deaf-specific` | Important for deaf/HoH users |

All findings always shown. Tags provide context. Teams decide what to act on.

### Fix patterns

For each violation, search the same codebase for components that pass the same criterion. Return the closest match as a fix pattern. Priority: same directory > same feature > anywhere in project.

### Integration with existing tools

| Tool | Change |
|------|--------|
| `detect_changes` | After mapping diff to symbols, report affected WCAG criteria |
| `impact` | When BFS reaches a component with A11ySignals, include them |
| `context` | Show a11y signals in 360-degree view |

## Implementation Phases

### Phase 1: Foundation — JSX extraction + core rules + wcag_audit tool
- Add JSX tree-sitter queries to TS/JS query strings
- ExtractedJSXElement extraction in parse worker
- A11ySignal node type in graph, LadybugDB schema, CSV generator
- 10 core rules: img-alt, icon-button-label, input-label, keyboard, no-keyboard-trap, bypass-blocks, language-page, name-role-value, status-messages, video-captions
- Basic `wcag_audit` MCP tool with compliance score + violation list
- Seed-based tests + pipeline-level tests

### Phase 2: Full WCAG 2.2 AA rule coverage
- Remaining 32 rules across all 4 principles
- Tailwind resolver for CSS-related rules
- Per-route compliance matrix in wcag_audit output
- Fix pattern search
- Compliance tags (EU/WCAG AAA/deaf-specific)
- Real-repo validation on fluentiagrant-app

### Phase 3: Tool integration + graph-enhanced rules
- Extend detect_changes with a11y regression detection
- Extend impact and context tools
- Graph-enhanced rules (bypass-blocks per page, consistent-help, landmark completeness)
- Cross-project pattern matching

## Testing Strategy

### Seed-based tests (per rule)
- Fixture JSX with known violations → assert A11ySignal created
- Fixture JSX with no violations → assert no false positive
- Break fixture to confirm test catches the change

### Pipeline-level tests
- Synthetic mini-project with JSX components
- Assert node/edge counts and signal verdicts

### Real-repo validation
- fluentiagrant-app (rich a11y infrastructure — verify detection matches existing audit)
- collector (PHP — verify zero false positives on non-JSX project)
- kurz-spj-sk (Next.js — deaf user context)

### MCP tool smoke tests
- Invoke wcag_audit after each implementation phase
- Verify output format matches spec

## Post-Implementation Process (every phase)

1. Run /simplify on the branch
2. Real-repo validation
3. Squash duplicate commits
4. Audit PR body for private project references
5. Push to fork and create PR
