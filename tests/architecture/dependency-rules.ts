import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';

const require = createRequire(import.meta.url);
const CONFIG = resolve('.dependency-cruiser.cjs');
export const { LAYERS, PACKAGES } = require('../../scripts/architecture.cjs') as {
  LAYERS: Record<string, string[]>;
  PACKAGES: Record<string, string[]>;
};

export interface Violation {
  rule: string;
  from: string;
  to: string;
}

/** Runs the project's dependency-cruiser rules on `<baseDir>/src`. */
export async function dependencyViolations(
  baseDir = resolve('.'),
  tsConfig?: string,
): Promise<{ violations: Violation[]; rules: string[]; modules: number }> {
  const options = await extractDepcruiseOptions(CONFIG);
  if (!tsConfig) delete options.tsConfig;
  const result = await cruise(
    ['src'],
    { ...options, baseDir },
    undefined,
    tsConfig ? { tsConfig: extractTSConfig(tsConfig) } : undefined,
  );
  const output = result.output as ICruiseResult;
  return {
    violations: output.summary.violations.map(({ rule, from, to }) => ({
      rule: rule.name,
      from,
      to,
    })),
    rules: (options.ruleSet?.forbidden ?? []).map((rule) => rule.name!),
    modules: output.summary.totalCruised,
  };
}

/**
 * A throwaway project that breaks every rule once: a cycle, an orphan, an unresolved
 * import, a test import, a dev dependency, and for each layer one forbidden layer and one
 * forbidden package. It lives inside the repository so packages resolve from node_modules.
 */
export function violatingProject(): { root: string; remove(): void } {
  const parent = resolve('test-results/unmanaged');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'architecture-'));
  const files: Record<string, string> = {
    'src/main.tsx': 'export {};',
    'src/domain/cycle-a.ts': "import './cycle-b';",
    'src/domain/cycle-b.ts': "import './cycle-a';",
    'src/domain/orphan.ts': 'export const unused = 1;',
    'src/application/unresolved.ts': "import './does-not-exist';",
    'src/app/imports-test.ts': "import '../../tests/helper';",
    'tests/helper.ts': 'export {};',
    'src/components/imports-dev-dependency.ts': "import 'vitest';",
  };
  for (const [layer, allowed] of Object.entries(LAYERS)) {
    const forbidden = Object.keys(LAYERS).find((other) => !allowed.includes(other));
    if (forbidden) {
      files[`src/${layer}/crosses-layer.ts`] = `import '../${forbidden}/target';`;
      files[`src/${forbidden}/target.ts`] = 'export {};';
    }
    // `typescript` is installed but allowed in no layer.
    files[`src/${layer}/uses-package.ts`] = "import 'typescript';";
  }
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${source}\n`);
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
