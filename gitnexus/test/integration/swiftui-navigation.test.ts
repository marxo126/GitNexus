import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';
import type { PipelineResult } from '../../src/types/pipeline.js';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'swiftui-nav-repo');

describe('SwiftUI navigation graph', () => {
  let result: PipelineResult;
  beforeAll(async () => { result = await runPipelineFromRepo(FIXTURE, () => {}); }, 60000);

  it('creates Struct nodes for SwiftUI Views', () => {
    const structs: string[] = [];
    result.graph.forEachNode(n => { if (n.label === 'Struct') structs.push(n.properties.name as string); });
    expect(structs).toContain('ContentView');
    expect(structs).toContain('ProductDetailView');
    expect(structs).toContain('MainTabView');
  });

  it('creates NAVIGATES_TO edges', () => {
    const navEdges: { target: string; reason: string }[] = [];
    result.graph.forEachRelationship(r => {
      if (r.type === 'NAVIGATES_TO') {
        const tgt = result.graph.getNode(r.targetId);
        navEdges.push({ target: (tgt?.properties.name ?? tgt?.id) as string, reason: r.reason ?? '' });
      }
    });
    expect(navEdges.length).toBeGreaterThan(0);
    expect(navEdges.some(e => e.reason === 'navigation-link' && e.target === 'ProductDetailView')).toBe(true);
    expect(navEdges.some(e => e.reason === 'sheet' && e.target === 'SettingsView')).toBe(true);
    expect(navEdges.some(e => e.reason === 'full-screen-cover' && e.target === 'CameraView')).toBe(true);
    expect(navEdges.some(e => e.reason === 'tab-view' && e.target === 'HomeView')).toBe(true);
  });

  it('source Views are detected', () => {
    const sources: string[] = [];
    result.graph.forEachRelationship(r => {
      if (r.type === 'NAVIGATES_TO') {
        const src = result.graph.getNode(r.sourceId);
        if (src?.label === 'Struct') sources.push(src.properties.name as string);
      }
    });
    expect(sources).toContain('ContentView');
    expect(sources).toContain('MainTabView');
  });
});
