/**
 * Module-level architecture rules for `src`: layers, packages, cycles, orphans.
 * Enforced by tests/architecture/architecture.test.ts; `npm run arch` prints the report.
 * Rules that need the syntax tree (browser APIs, where adapters are built, hook placement)
 * live in tests/architecture/code-rules.ts.
 */

const { LAYERS, PACKAGES } = require('./scripts/architecture.cjs');

const alternation = (names) => `(${names.join('|')})`;

// A layer allowed to reach every other one (app) gets no rule: it could never fail.
const layerRules = Object.entries(LAYERS)
  .filter(([, allowed]) => allowed.length < Object.keys(LAYERS).length)
  .map(([layer, allowed]) => ({
    name: `layer-${layer}`,
    comment: `${layer} may depend only on ${allowed.join(', ')} (ADR 0001).`,
    severity: 'error',
    from: { path: `^src/${layer}/` },
    to: { path: '^src/', pathNot: `^src/${alternation(allowed)}/` },
  }));

const packageRules = Object.keys(LAYERS).map((layer) => {
  const allowed = PACKAGES[layer] ?? [];
  return {
    name: `packages-${layer}`,
    comment: allowed.length
      ? `${layer} may use only the packages ${allowed.join(', ')}.`
      : `${layer} is pure TypeScript and uses no packages.`,
    severity: 'error',
    from: { path: `^src/${layer}/` },
    to: {
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'core'],
      ...(allowed.length ? { pathNot: `node_modules/${alternation(allowed)}/` } : {}),
    },
  };
});

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Modules form a DAG; a cycle means two modules are one responsibility split badly.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    ...layerRules,
    ...packageRules,
    {
      name: 'no-tests-in-production',
      comment: 'Production code never imports tests or test tooling.',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: ['^tests/', '\\.(test|spec)\\.tsx?$'] },
    },
    {
      name: 'no-dev-dependencies-in-production',
      comment: 'Only runtime dependencies ship in the bundle.',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-orphans',
      comment: 'A module nothing imports is dead code (main.tsx is the entry).',
      severity: 'error',
      from: { orphan: true, path: '^src/', pathNot: ['^src/main\\.tsx$', '\\.d\\.ts$'] },
      to: {},
    },
    {
      name: 'no-unresolvable',
      comment: 'Every import resolves to a file or an installed package.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    reporterOptions: {
      dot: { collapsePattern: '^src/[^/]+' },
      archi: { collapsePattern: '^src/[^/]+' },
    },
  },
};
