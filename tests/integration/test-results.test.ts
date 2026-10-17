// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readlink, rm, lstat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { Writable } from 'node:stream';
import { createRun, finishRun, runTestCommand } from '../../scripts/run-tests.mjs';

async function workspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'maplet-test-results-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const sink = () =>
  new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });

describe('test run artifacts', () => {
  it('isolates simultaneous runs with the same timestamp and publishes only completed runs', async () => {
    await workspace(async (root) => {
      const now = new Date('2026-10-17T12:34:56.789Z');
      const [first, second] = await Promise.all([
        createRun({ root, kind: 'unit', command: ['vitest', 'run'], now }),
        createRun({ root, kind: 'unit', command: ['vitest', 'run'], now }),
      ]);
      expect(first.directory).not.toBe(second.directory);
      expect(basename(first.directory)).toMatch(/^2026-10-17T12-34-56-789Z-unit-/);
      await expect(lstat(join(root, 'latest'))).rejects.toThrow();
      expect(JSON.parse(await readFile(join(first.directory, 'summary.json'), 'utf8')).status).toBe(
        'running',
      );
      await finishRun(first, { exitCode: 0, signal: null });
      expect(await readlink(join(root, 'latest'))).toBe(basename(first.directory));
      expect(await readlink(join(root, 'latest-unit'))).toBe(basename(first.directory));
      expect(await readFile(join(root, 'latest', 'summary.json'), 'utf8')).toContain('"passed"');
    });
  });
  it('publishes failed runs too, preserves history and keeps links for each test kind', async () => {
    await workspace(async (root) => {
      const first = await createRun({
        root,
        kind: 'coverage',
        command: ['vitest', 'run', '--coverage'],
      });
      await writeFile(join(first.directory, 'preserved.txt'), 'previous result');
      await finishRun(first, { exitCode: 0, signal: null });
      const second = await createRun({ root, kind: 'e2e', command: ['playwright', 'test'] });
      await finishRun(second, { exitCode: 1, signal: null });
      expect(await readlink(join(root, 'latest'))).toBe(basename(second.directory));
      expect(await readlink(join(root, 'latest-coverage'))).toBe(basename(first.directory));
      expect(await readlink(join(root, 'latest-e2e'))).toBe(basename(second.directory));
      expect(await readFile(join(first.directory, 'preserved.txt'), 'utf8')).toBe(
        'previous result',
      );
      const summary = JSON.parse(await readFile(join(root, 'latest', 'summary.json'), 'utf8'));
      expect(summary).toMatchObject({
        kind: 'e2e',
        status: 'failed',
        exitCode: 1,
        signal: null,
        command: ['playwright', 'test'],
      });
      expect(Date.parse(summary.finishedAt)).toBeGreaterThanOrEqual(Date.parse(summary.startedAt));
    });
  });
  it('captures both output streams, passes the artifact directory and preserves the failing exit code', async () => {
    await workspace(async (root) => {
      const result = await runTestCommand({
        resultsRoot: root,
        kind: 'unit',
        command: process.execPath,
        args: [
          '-e',
          `require('node:fs').writeFileSync(require('node:path').join(process.env.MAPLET_TEST_RUN_DIR, 'report.json'), '{}'); console.log('stdout marker'); console.error('stderr marker'); process.exit(7);`,
        ],
        stdout: sink(),
        stderr: sink(),
      });
      expect(result.exitCode).toBe(7);
      const log = await readFile(join(root, 'latest', 'run.log'), 'utf8');
      expect(log).toContain('stdout marker');
      expect(log).toContain('stderr marker');
      expect(await readFile(join(root, 'latest', 'report.json'), 'utf8')).toBe('{}');
    });
  });
  it('records startup errors and interruption without marking them as passed', async () => {
    await workspace(async (root) => {
      const result = await runTestCommand({
        resultsRoot: root,
        kind: 'unit',
        command: join(root, 'missing-executable'),
        args: [],
        stdout: sink(),
        stderr: sink(),
      });
      expect(result.exitCode).toBe(1);
      expect(await readFile(join(root, 'latest', 'run.log'), 'utf8')).toContain('ENOENT');
      const run = await createRun({ root, kind: 'e2e', command: ['playwright', 'test'] });
      await finishRun(run, { exitCode: 130, signal: 'SIGINT' });
      expect(
        JSON.parse(await readFile(join(root, 'latest', 'summary.json'), 'utf8')),
      ).toMatchObject({ status: 'interrupted', exitCode: 130, signal: 'SIGINT' });
    });
  });
  it.each([
    ['SIGTERM', 143],
    ['SIGKILL', 137],
  ] as const)('records a child terminated by %s as interrupted', async (signal, exitCode) => {
    await workspace(async (root) => {
      const result = await runTestCommand({
        resultsRoot: root,
        kind: 'unit',
        command: process.execPath,
        args: ['-e', `process.kill(process.pid, '${signal}')`],
        stdout: sink(),
        stderr: sink(),
      });
      expect(result).toEqual({ exitCode, signal });
      expect(
        JSON.parse(await readFile(join(root, 'latest', 'summary.json'), 'utf8')),
      ).toMatchObject({ status: 'interrupted', exitCode, signal });
    });
  });
});
