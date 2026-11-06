import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { dependencyViolations, violatingProject, LAYERS } from './dependency-rules';
import { codeViolations, sourceFiles } from './code-rules';

describe('module rules (dependency-cruiser)', () => {
  it('keeps src layered, acyclic, free of orphans and independent from tests', async () => {
    const { violations, modules } = await dependencyViolations(
      resolve('.'),
      resolve('tsconfig.app.json'),
    );
    expect(modules).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });

  it('proves every configured rule fails on a project that breaks it', async () => {
    const project = violatingProject();
    try {
      const { violations, rules } = await dependencyViolations(project.root);
      const fired = new Set(violations.map(({ rule }) => rule));
      expect([...rules].sort()).toEqual([...fired].sort());
      expect(violations).toContainEqual({
        rule: 'no-circular',
        from: 'src/domain/cycle-a.ts',
        to: 'src/domain/cycle-b.ts',
      });
      // Every layer with a forbidden neighbour is caught crossing into it.
      for (const layer of Object.keys(LAYERS).filter((name) => name !== 'app'))
        expect(violations.map((v) => `${v.rule}:${v.from}`)).toContain(
          `layer-${layer}:src/${layer}/crosses-layer.ts`,
        );
    } finally {
      project.remove();
    }
  }, 30_000);
});

describe('code rules (syntax tree)', () => {
  it('holds for src', () => {
    expect(codeViolations(sourceFiles(resolve('src')))).toEqual([]);
  });

  it('fails for browser globals, storage outside adapters, dynamic imports, stray adapters and misplaced hooks', () => {
    const violations = codeViolations([
      { name: 'domain/a.ts', source: 'export const a = () => localStorage.getItem("x");' },
      { name: 'engine/b.ts', source: 'export const b = (p: string) => import(p);' },
      { name: 'i18n/c.ts', source: 'export const c = () => document.title;' },
      { name: 'components/d.ts', source: 'export const d = () => sessionStorage.clear();' },
      { name: 'adapters/e.ts', source: 'export const e = () => localStorage.clear();' },
      {
        name: 'adapters/store.ts',
        source:
          'export class Store {}\nexport class Oops extends Error {}\n' +
          'export class Port implements Reader {}',
      },
      {
        name: 'app/useThing.ts',
        source: 'import { Store } from "../adapters/store";\nexport const s = new Store();',
      },
      { name: 'main.tsx', source: 'import { Store } from "./adapters/store";\nnew Store();' },
      { name: 'app/c.ts', source: 'throw new Oops();' },
      { name: 'app/d.ts', source: 'export const p = new Port();' },
      { name: 'domain/hooks.ts', source: 'export function useMap() {}' },
      { name: 'components/useView.ts', source: 'export const useView = () => 1;' },
    ]);
    expect(violations).toEqual([
      'Pure layer uses a browser global: domain/a.ts → localStorage',
      'Nonliteral import: engine/b.ts',
      'Pure layer uses a browser global: i18n/c.ts → document',
      'Browser storage outside adapters: components/d.ts → sessionStorage',
      'Adapter built outside a composition root: app/useThing.ts → Store',
      'Adapter built outside a composition root: app/d.ts → Port',
      'Hook outside the UI layers: domain/hooks.ts → useMap',
    ]);
  });
});
