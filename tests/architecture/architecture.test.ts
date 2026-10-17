import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkGraph, sourceGraph } from './rules';

describe('architecture as executable rules', () => {
  it('keeps production dependencies acyclic, layered and independent from tests', () => {
    const { graph, browserLeaks } = sourceGraph(resolve('src'));
    expect(Object.keys(graph).length).toBeGreaterThan(3);
    expect(Object.keys(graph).filter((file) => /\.test\.|\.spec\./.test(file))).toEqual([]);
    expect(checkGraph(graph)).toEqual([]);
    expect(browserLeaks).toEqual([]);
  });
  it('proves the rules fail for cycles, forbidden layers, test imports and impure domain', () => {
    expect(checkGraph({ 'domain/a.ts': ['domain/b.ts'], 'domain/b.ts': ['domain/a.ts'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('Cycle')]),
    );
    expect(checkGraph({ 'domain/a.ts': ['components/a.tsx'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('Forbidden')]),
    );
    expect(checkGraph({ 'app/a.ts': ['../tests/a.test.ts'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('Production imports test')]),
    );
    expect(checkGraph({ 'domain/a.ts': ['external:react'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('Pure layer')]),
    );
    expect(checkGraph({ 'components/a.tsx': ['external:vitest'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('Production imports test package')]),
    );
    expect(
      checkGraph({ 'app/a.ts': ['components/a.tsx'], 'components/a.tsx': ['domain/a.ts'] }),
    ).toEqual([]);
  });
});
