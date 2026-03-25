/**
 * SwiftUI Navigation Pattern Detection
 *
 * Regex-based extraction of NavigationLink, .sheet, .fullScreenCover,
 * .navigationDestination, and TabView patterns from Swift source files.
 */

export type SwiftUINavigationType = 'navigation-link' | 'sheet' | 'full-screen-cover' | 'navigation-destination' | 'tab-view';

export interface ExtractedNavigation {
  filePath: string;
  sourceView?: string;
  targetView: string;
  navigationType: SwiftUINavigationType;
  lineNumber: number;
}

const NAVIGATION_LINK_RE = /NavigationLink\s*\(\s*(?:destination\s*:\s*)?([A-Z]\w*View\w*)\s*\(/g;
const SHEET_RE = /\.(sheet|fullScreenCover)\s*\([^)]*\)\s*\{[\s\S]*?([A-Z]\w*View\w*)\s*\(/g;
const NAV_DESTINATION_RE = /\.navigationDestination\s*\([^)]*\)\s*\{[\s\S]*?([A-Z]\w*View\w*)\s*\(/g;
const TABVIEW_RE = /TabView\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\n\}/g;
const TABVIEW_CHILD_RE = /([A-Z]\w*View\w*)\s*\(\s*\)/g;

const findEnclosingSwiftView = (content: string, offset: number): string | undefined => {
  const before = content.slice(0, offset);
  const structRe = /struct\s+(\w+)\s*(?::\s*[\w,\s]+)?\{/g;
  let lastMatch: string | undefined;
  let m;
  while ((m = structRe.exec(before)) !== null) { lastMatch = m[1]; }
  return lastMatch;
};

export const extractSwiftUINavigations = (filePath: string, content: string, navigations: ExtractedNavigation[]): void => {
  if (!filePath.endsWith('.swift')) return;
  let match;

  NAVIGATION_LINK_RE.lastIndex = 0;
  while ((match = NAVIGATION_LINK_RE.exec(content)) !== null) {
    const lineNumber = content.slice(0, match.index).split('\n').length - 1;
    navigations.push({ filePath, sourceView: findEnclosingSwiftView(content, match.index), targetView: match[1], navigationType: 'navigation-link', lineNumber });
  }

  SHEET_RE.lastIndex = 0;
  while ((match = SHEET_RE.exec(content)) !== null) {
    const lineNumber = content.slice(0, match.index).split('\n').length - 1;
    const navType = match[1] === 'fullScreenCover' ? 'full-screen-cover' as const : 'sheet' as const;
    navigations.push({ filePath, sourceView: findEnclosingSwiftView(content, match.index), targetView: match[2], navigationType: navType, lineNumber });
  }

  NAV_DESTINATION_RE.lastIndex = 0;
  while ((match = NAV_DESTINATION_RE.exec(content)) !== null) {
    const lineNumber = content.slice(0, match.index).split('\n').length - 1;
    navigations.push({ filePath, sourceView: findEnclosingSwiftView(content, match.index), targetView: match[1], navigationType: 'navigation-destination', lineNumber });
  }

  TABVIEW_RE.lastIndex = 0;
  while ((match = TABVIEW_RE.exec(content)) !== null) {
    const tabLineNumber = content.slice(0, match.index).split('\n').length - 1;
    const sourceView = findEnclosingSwiftView(content, match.index);
    let childMatch;
    TABVIEW_CHILD_RE.lastIndex = 0;
    while ((childMatch = TABVIEW_CHILD_RE.exec(match[1])) !== null) {
      navigations.push({ filePath, sourceView, targetView: childMatch[1], navigationType: 'tab-view', lineNumber: tabLineNumber });
    }
  }
};
