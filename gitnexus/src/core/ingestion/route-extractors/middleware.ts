/**
 * Middleware chain extraction from route handler file content.
 * Detects wrapper patterns like: export const POST = withA(withB(withC(handler)))
 */

/** Keywords that terminate middleware chain walking (not wrapper function names) */
export const MIDDLEWARE_STOP_KEYWORDS = new Set([
  'async', 'await', 'function', 'new', 'return', 'if', 'for', 'while', 'switch',
  'class', 'const', 'let', 'var', 'req', 'res', 'request', 'response',
  'event', 'ctx', 'context', 'next',
]);

/**
 * Extract middleware wrapper chain from a route handler file.
 * Detects patterns like: export const POST = withA(withB(withC(handler)))
 * Returns an object with the wrapper function names (outermost-first) and the
 * HTTP method they were captured from, or undefined if no chain found.
 */
export function extractMiddlewareChain(content: string): { chain: string[]; method: string } | undefined {
  const mwPattern = /export\s+(?:const\s+(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*=|default)\s+(\w+)\s*\(/g;
  let mwMatch;
  while ((mwMatch = mwPattern.exec(content)) !== null) {
    const method = mwMatch[1] ?? 'default';
    const firstWrapper = mwMatch[2];
    const chain: string[] = [firstWrapper];
    let pos = mwMatch.index + mwMatch[0].length;
    const nestedPattern = /^\s*(\w+)\s*\(/;
    let remaining = content.slice(pos);
    let nestedMatch;
    while ((nestedMatch = nestedPattern.exec(remaining)) !== null) {
      const name = nestedMatch[1];
      if (MIDDLEWARE_STOP_KEYWORDS.has(name)) break;
      chain.push(name);
      pos += nestedMatch[0].length;
      remaining = content.slice(pos);
    }
    if (chain.length >= 2 || (chain.length === 1 && /^with[A-Z]/.test(chain[0]))) {
      return { chain, method };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Next.js project-level middleware.ts extraction
// ---------------------------------------------------------------------------

export interface NextjsMiddlewareConfig {
  matchers: string[];
  exportedName: string;
  wrappedFunctions: string[];
}

/**
 * Parse a Next.js project-level middleware.ts file and extract:
 * - config.matcher patterns (string or string[])
 * - the exported middleware function name
 * - wrapper composition (e.g. chain([withAuth, withI18n]))
 */
export function extractNextjsMiddlewareConfig(content: string): NextjsMiddlewareConfig | undefined {
  // --- matcher patterns ---
  const matchers: string[] = [];
  const matcherArrayRe = /config\s*=\s*\{[^}]*matcher\s*:\s*\[([^\]]*)\]/s;
  const matcherStringRe = /config\s*=\s*\{[^}]*matcher\s*:\s*(['"`])([^'"`]+)\1/s;
  const arrMatch = matcherArrayRe.exec(content);
  if (arrMatch) {
    const items = arrMatch[1];
    const strRe = /(['"`])((?:[^'"`\\\\]|\\\\.)*)\1/g;
    let m;
    while ((m = strRe.exec(items)) !== null) {
      matchers.push(m[2]);
    }
  } else {
    const strMatch = matcherStringRe.exec(content);
    if (strMatch) {
      matchers.push(strMatch[2]);
    }
  }

  // --- exported name ---
  let exportedName = 'middleware';
  const defaultExportRe = /export\s+default\s+(\w+)/;
  const namedExportRe = /export\s+(?:async\s+)?function\s+(\w+)/;
  const defaultMatch = defaultExportRe.exec(content);
  const namedMatch = namedExportRe.exec(content);
  if (defaultMatch) {
    exportedName = defaultMatch[1];
  } else if (namedMatch) {
    exportedName = namedMatch[1];
  }

  // --- wrapper composition ---
  const wrappedFunctions: string[] = [];
  // Pattern: chain([fn1, fn2]) or compose(fn1, fn2)
  const chainRe = /(?:chain|compose)\s*\(\s*\[([^\]]+)\]/;
  const chainMatch = chainRe.exec(content);
  if (chainMatch) {
    const fns = chainMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    wrappedFunctions.push(...fns);
  }
  // Pattern: export default withA(withB(handler))
  const wrapperRe = /export\s+default\s+(\w+)\s*\(/;
  const wrapperMatch = wrapperRe.exec(content);
  if (wrapperMatch && wrappedFunctions.length === 0) {
    const name = wrapperMatch[1];
    if (name !== 'function' && name !== 'async') {
      wrappedFunctions.push(name);
      let pos = wrapperMatch.index + wrapperMatch[0].length;
      const nestedRe = /^\s*(\w+)\s*\(/;
      let remaining = content.slice(pos);
      let nested;
      while ((nested = nestedRe.exec(remaining)) !== null) {
        if (MIDDLEWARE_STOP_KEYWORDS.has(nested[1])) break;
        wrappedFunctions.push(nested[1]);
        pos += nested[0].length;
        remaining = content.slice(pos);
      }
    }
  }

  // If the exported function name is meaningful, include it (skip composer names)
  const composerNames = new Set(['middleware', 'default', 'chain', 'compose']);
  if (!composerNames.has(exportedName) && !wrappedFunctions.includes(exportedName)) {
    wrappedFunctions.unshift(exportedName);
  }

  if (matchers.length === 0 && wrappedFunctions.length === 0) return undefined;

  return { matchers, exportedName, wrappedFunctions };
}

/**
 * Test whether a route URL matches a Next.js middleware matcher pattern.
 * Supports: '/api/:path*' (prefix), '/((?!api|_next).*)' (regex), '/exact' (exact).
 */
export function middlewareMatcherMatchesRoute(matcher: string, routeURL: string): boolean {
  // :path* suffix → prefix match
  const paramWild = matcher.replace(/\/:path\*$/, '');
  if (paramWild !== matcher) {
    return routeURL === paramWild || routeURL.startsWith(paramWild + '/');
  }

  // Regex-style matcher (contains parentheses)
  if (matcher.includes('(')) {
    try {
      const re = new RegExp('^' + matcher + '$');
      return re.test(routeURL);
    } catch {
      return false;
    }
  }

  // Exact match
  return routeURL === matcher;
}
