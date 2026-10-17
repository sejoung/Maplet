import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function findOversizedStyles(root, max = 400) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return findOversizedStyles(path, max);
    if (!entry.isFile() || !entry.name.endsWith('.css')) return [];
    const content = readFileSync(path, 'utf8');
    const lines = content.split(/\r\n|\r|\n/);
    // Match ESLint max-lines: an ending newline is not an additional blank line.
    if (lines.at(-1) === '') lines.pop();
    return lines.length > max ? [{ path, lines: lines.length }] : [];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findOversizedStyles(resolve('src'));
  for (const { path, lines } of violations)
    console.error(`${path}: ${lines} lines exceeds maximum 400`);
  process.exitCode = violations.length ? 1 : 0;
}
