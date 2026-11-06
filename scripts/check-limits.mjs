import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lines per file: ESLint `max-lines` covers code, this covers CSS with the same boundary. */
export const MAX_LINES = 400;
/** Files directly inside one folder; past this, a folder is split by topic so files stay findable. */
export const MAX_FOLDER_FILES = 10;
/** Code folders the folder limit applies to; docs and image assets keep their flat layouts. */
export const CODE_ROOTS = ['src', 'tests', 'scripts'];

const visible = (entry) => !entry.name.startsWith('.');

export function findOversizedStyles(root, max = MAX_LINES) {
  return readdirSync(root, { withFileTypes: true })
    .filter(visible)
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return findOversizedStyles(path, max);
      if (!entry.isFile() || !entry.name.endsWith('.css')) return [];
      const lines = readFileSync(path, 'utf8').split(/\r\n|\r|\n/);
      // Match ESLint max-lines: an ending newline is not an additional blank line.
      if (lines.at(-1) === '') lines.pop();
      return lines.length > max ? [{ path, lines: lines.length }] : [];
    });
}

/** Folders under `root` (itself included) that hold more than `max` files directly. */
export function findCrowdedFolders(root, max = MAX_FOLDER_FILES) {
  const entries = readdirSync(root, { withFileTypes: true }).filter(visible);
  const files = entries.filter((entry) => entry.isFile()).length;
  return [
    ...(files > max ? [{ path: root, files }] : []),
    ...entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .flatMap((entry) => findCrowdedFolders(join(root, entry.name), max)),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messages = [
    ...findOversizedStyles(resolve('src')).map(
      ({ path, lines }) => `${path}: ${lines} lines exceeds maximum ${MAX_LINES}`,
    ),
    ...CODE_ROOTS.flatMap((root) => findCrowdedFolders(resolve(root))).map(
      ({ path, files }) =>
        `${path}: ${files} files exceeds maximum ${MAX_FOLDER_FILES}; group them into topic folders`,
    ),
  ];
  for (const message of messages) console.error(message);
  process.exitCode = messages.length ? 1 : 0;
}
