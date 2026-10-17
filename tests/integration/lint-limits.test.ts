// @vitest-environment node
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOversizedStyles } from '../../scripts/check-style-lines.mjs';

it.each(['src/domain/example.ts', 'tests/unit/example.test.ts', 'scripts/example.mjs'])(
  'allows 400 lines and rejects 401 including comments and blanks in %s',
  async (filePath) => {
    const eslint = new ESLint();
    const accepted = await eslint.lintText('// comment\n'.repeat(400), { filePath });
    expect(accepted[0].messages.filter((message) => message.ruleId === 'max-lines')).toEqual([]);
    for (const lastLine of ['// extra comment\n', '\n']) {
      const rejected = await eslint.lintText('// comment\n'.repeat(400) + lastLine, { filePath });
      expect(rejected[0].messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ ruleId: 'max-lines', severity: 2 })]),
      );
    }
  },
);

it('checks nested CSS files with the same 400 line boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maplet-style-limit-'));
  try {
    await mkdir(join(root, 'nested'));
    const path = join(root, 'nested', 'example.css');
    await writeFile(path, '/* comment */\n'.repeat(400));
    expect(findOversizedStyles(root)).toEqual([]);
    await writeFile(path, '/* comment */\r\n'.repeat(400) + '\r\n');
    expect(findOversizedStyles(root)).toEqual([{ path, lines: 401 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
