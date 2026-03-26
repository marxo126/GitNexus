import type { FTSIndexDef } from '../helpers/test-indexed-db.js';

/**
 * Seed data for wcag_audit E2E tests.
 *
 * Simulates what the pipeline would produce for a React project with:
 * - Components with a11y violations (missing alt, missing labels)
 * - Components that pass a11y checks (proper alt text, proper labels)
 * - Mixed criteria across files
 * - Route nodes for per-route compliance testing
 */
export const A11Y_SEED_DATA = [
  // ─── Files ─────────────────────────────────────────────────────────
  `CREATE (f:File {id: 'file:components/Hero.tsx', name: 'Hero.tsx', filePath: 'components/Hero.tsx', content: '<img src="hero.png" />'})`,
  `CREATE (f:File {id: 'file:components/LoginForm.tsx', name: 'LoginForm.tsx', filePath: 'components/LoginForm.tsx', content: '<input type="text" />'})`,
  `CREATE (f:File {id: 'file:components/AccessibleCard.tsx', name: 'AccessibleCard.tsx', filePath: 'components/AccessibleCard.tsx', content: '<img alt="Card image" />'})`,
  `CREATE (f:File {id: 'file:pages/home.tsx', name: 'home.tsx', filePath: 'pages/home.tsx', content: '<main>...</main>'})`,

  // ─── Functions (components) ─────────────────────────────────────────
  `CREATE (fn:Function {id: 'func:Hero', name: 'Hero', filePath: 'components/Hero.tsx', startLine: 1, endLine: 10, isExported: true, content: 'export function Hero()', description: 'Hero banner component'})`,
  `CREATE (fn:Function {id: 'func:LoginForm', name: 'LoginForm', filePath: 'components/LoginForm.tsx', startLine: 1, endLine: 15, isExported: true, content: 'export function LoginForm()', description: 'Login form component'})`,
  `CREATE (fn:Function {id: 'func:AccessibleCard', name: 'AccessibleCard', filePath: 'components/AccessibleCard.tsx', startLine: 1, endLine: 8, isExported: true, content: 'export function AccessibleCard()', description: 'Accessible card component'})`,
  `CREATE (fn:Function {id: 'func:HomePage', name: 'HomePage', filePath: 'pages/home.tsx', startLine: 1, endLine: 20, isExported: true, content: 'export function HomePage()', description: 'Home page component'})`,

  // ─── A11ySignal nodes ──────────────────────────────────────────────
  // Violation: img without alt (criterion 1.1.1)
  `CREATE (s:A11ySignal {id: 'A11ySignal:components/Hero.tsx:3:img-alt', name: 'img-alt', filePath: 'components/Hero.tsx', startLine: 3, criterion: '1.1.1', signalStatus: 'violation', severity: 'critical', element: 'img', complianceTag: 'eu-required', confidence: 'definite'})`,

  // Needs-review: input without label (criterion 1.3.1) — can't statically prove label absence
  `CREATE (s:A11ySignal {id: 'A11ySignal:components/LoginForm.tsx:5:input-label', name: 'input-label', filePath: 'components/LoginForm.tsx', startLine: 5, criterion: '1.3.1', signalStatus: 'needs-review', severity: 'serious', element: 'input', complianceTag: 'eu-required', confidence: 'definite'})`,

  // Needs-review: button without explicit keyboard handler (criterion 2.1.1)
  `CREATE (s:A11ySignal {id: 'A11ySignal:components/LoginForm.tsx:10:keyboard', name: 'keyboard', filePath: 'components/LoginForm.tsx', startLine: 10, criterion: '2.1.1', signalStatus: 'needs-review', severity: 'moderate', element: 'div[onClick]', complianceTag: 'eu-required', confidence: 'heuristic'})`,

  // Pass: img with proper alt (criterion 1.1.1)
  `CREATE (s:A11ySignal {id: 'A11ySignal:components/AccessibleCard.tsx:4:img-alt', name: 'img-alt', filePath: 'components/AccessibleCard.tsx', startLine: 4, criterion: '1.1.1', signalStatus: 'pass', severity: 'critical', element: 'img', complianceTag: 'eu-required', confidence: 'definite'})`,

  // Pass: proper landmarks (criterion 1.3.1)
  `CREATE (s:A11ySignal {id: 'A11ySignal:pages/home.tsx:2:landmarks', name: 'landmarks', filePath: 'pages/home.tsx', startLine: 2, criterion: '1.3.1', signalStatus: 'pass', severity: 'serious', element: 'main', complianceTag: 'eu-required', confidence: 'definite'})`,

  // Needs-review: missing page title (criterion 2.4.2) — can't statically prove absence
  `CREATE (s:A11ySignal {id: 'A11ySignal:pages/home.tsx:1:page-titled', name: 'page-titled', filePath: 'pages/home.tsx', startLine: 1, criterion: '2.4.2', signalStatus: 'needs-review', severity: 'serious', element: 'html', complianceTag: 'eu-required', confidence: 'definite'})`,

  // ─── HAS_A11Y_SIGNAL edges ─────────────────────────────────────────
  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:Hero' AND s.id = 'A11ySignal:components/Hero.tsx:3:img-alt'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 1.0, reason: 'wcag-1.1.1', step: 0}]->(s)`,

  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:LoginForm' AND s.id = 'A11ySignal:components/LoginForm.tsx:5:input-label'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 1.0, reason: 'wcag-1.3.1', step: 0}]->(s)`,

  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:LoginForm' AND s.id = 'A11ySignal:components/LoginForm.tsx:10:keyboard'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 0.85, reason: 'wcag-2.1.1', step: 0}]->(s)`,

  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:AccessibleCard' AND s.id = 'A11ySignal:components/AccessibleCard.tsx:4:img-alt'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 1.0, reason: 'wcag-1.1.1', step: 0}]->(s)`,

  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:HomePage' AND s.id = 'A11ySignal:pages/home.tsx:2:landmarks'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 1.0, reason: 'wcag-1.3.1', step: 0}]->(s)`,

  `MATCH (a:Function), (s:A11ySignal) WHERE a.id = 'func:HomePage' AND s.id = 'A11ySignal:pages/home.tsx:1:page-titled'
   CREATE (a)-[:CodeRelation {type: 'HAS_A11Y_SIGNAL', confidence: 1.0, reason: 'wcag-2.4.2', step: 0}]->(s)`,

  // ─── Route nodes + HANDLES_ROUTE edges (for per-route testing) ──────
  `CREATE (r:Route {id: 'Route:/', name: '/', filePath: 'pages/home.tsx', responseKeys: [], errorKeys: [], middleware: []})`,

  `MATCH (fn:Function), (r:Route) WHERE fn.id = 'func:HomePage' AND r.id = 'Route:/'
   CREATE (fn)-[:CodeRelation {type: 'HANDLES_ROUTE', confidence: 1.0, reason: 'nextjs-filesystem-route', step: 0}]->(r)`,
];

export const A11Y_FTS_INDEXES: FTSIndexDef[] = [
  { table: 'Function', indexName: 'function_fts', columns: ['name', 'content', 'description'] },
  { table: 'File', indexName: 'file_fts', columns: ['name', 'content'] },
];
