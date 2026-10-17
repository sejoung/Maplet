import ts from 'typescript';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

export type Graph = Record<string, string[]>;
const allowed: Record<string, string[]> = {
  domain: ['domain'],
  application: ['application', 'domain'],
  engine: ['engine', 'domain'],
  adapters: ['adapters', 'domain'],
  components: ['components', 'application', 'domain', 'engine'],
  app: ['app', 'components', 'application', 'domain', 'engine', 'adapters'],
};

export function checkGraph(graph: Graph): string[] {
  const errors: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (file: string, trail: string[]) => {
    if (visiting.has(file)) {
      errors.push(`Cycle: ${[...trail, file].join(' → ')}`);
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const target of graph[file] ?? []) {
      const layer = file.split('/')[0];
      const targetLayer = target.split('/')[0];
      if (target.includes('tests/') || target.includes('.test.'))
        errors.push(`Production imports test: ${file} → ${target}`);
      if (target.startsWith('external:')) {
        if (/vitest|playwright|@testing-library|fake-indexeddb|jest/.test(target))
          errors.push(`Production imports test package: ${file} → ${target}`);
        if (['domain', 'application', 'engine'].includes(layer))
          errors.push(`Pure layer imports package: ${file} → ${target}`);
      } else if (allowed[layer] && !allowed[layer].includes(targetLayer))
        errors.push(`Forbidden dependency: ${file} → ${target}`);
      if (graph[target]) walk(target, [...trail, file]);
    }
    visiting.delete(file);
    visited.add(file);
  };
  Object.keys(graph).forEach((file) => walk(file, []));
  return errors;
}

export function sourceGraph(root: string): { graph: Graph; browserLeaks: string[] } {
  const graph: Graph = {};
  const browserLeaks: string[] = [];
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(resolve(dir, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [resolve(dir, entry.name)]
          : [],
    );
  for (const path of files(root)) {
    const name = relative(root, path);
    const ast = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const targets: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
          targets.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        if (node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
          targets.push(node.arguments[0].text);
        else browserLeaks.push(`Nonliteral import: ${name}`);
      }
      if (
        ['domain', 'application', 'engine'].includes(name.split('/')[0]) &&
        ts.isIdentifier(node) &&
        [
          'window',
          'document',
          'indexedDB',
          'localStorage',
          'sessionStorage',
          'fetch',
          'navigator',
        ].includes(node.text)
      )
        browserLeaks.push(`${name}: ${node.text}`);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    graph[name] = targets
      .filter((target) => !target.endsWith('.css'))
      .map((target) => {
        if (!target.startsWith('.')) return `external:${target}`;
        const base = resolve(dirname(path), target);
        const resolved = ['.ts', '.tsx', '/index.ts', '/index.tsx', '']
          .map((ext) => base + ext)
          .find(existsSync);
        if (!resolved) throw new Error(`Unresolved import: ${name} → ${target}`);
        return relative(root, resolved);
      });
  }
  return { graph, browserLeaks };
}
