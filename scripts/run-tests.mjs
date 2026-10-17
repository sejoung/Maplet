import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, symlink, writeFile } from 'node:fs/promises';
import { closeSync, openSync, writeSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createRun({ root, kind, command, now = new Date() }) {
  if (!/^[a-z][a-z0-9]*$/.test(kind)) throw new Error('Invalid test kind');
  root = resolve(root);
  await mkdir(root, { recursive: true });
  const stamp = now.toISOString().replaceAll(':', '-').replace('.', '-');
  const directory = await mkdtemp(join(root, `${stamp}-${kind}-`));
  const summary = { kind, command, startedAt: now.toISOString(), status: 'running' };
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return { root, directory, summary };
}

export async function finishRun(run, { exitCode, signal }) {
  const finishedAt = new Date();
  const summary = {
    ...run.summary,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - Date.parse(run.summary.startedAt),
    status: signal ? 'interrupted' : exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    signal,
  };
  const temporarySummary = join(run.directory, 'summary.json.tmp');
  await writeFile(temporarySummary, JSON.stringify(summary, null, 2) + '\n');
  await rename(temporarySummary, join(run.directory, 'summary.json'));
  for (const name of ['latest', `latest-${run.summary.kind}`]) {
    const temporaryLink = join(run.root, `.${name}-${randomUUID()}`);
    // Relative targets remain valid when the whole results folder is moved.
    await symlink(basename(run.directory), temporaryLink, 'dir');
    await rename(temporaryLink, join(run.root, name));
  }
}

/**
 * @param {{kind: string, command: string, args: string[], cwd?: string, resultsRoot?: string,
 *   stdout?: import('node:stream').Writable, stderr?: import('node:stream').Writable}} options
 */
export async function runTestCommand({
  kind,
  command,
  args,
  cwd = projectRoot,
  resultsRoot = join(cwd, 'test-results'),
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  const run = await createRun({ root: resultsRoot, kind, command: [command, ...args] });
  stdout.write(`Test results: ${run.directory}\n`);
  const log = openSync(join(run.directory, 'run.log'), 'w');
  let requestedSignal = null;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, MAPLET_TEST_RUN_DIR: run.directory },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const forwardSignal = (signal) => {
    requestedSignal = signal;
    child.kill(signal);
  };
  const interrupt = () => forwardSignal('SIGINT');
  const terminate = () => forwardSignal('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  child.stdout.on('data', (chunk) => {
    writeSync(log, chunk);
    stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    writeSync(log, chunk);
    stderr.write(chunk);
  });
  let startupError = false;
  child.on('error', (error) => {
    startupError = true;
    writeSync(log, `${error.stack ?? error.message}\n`);
    stderr.write(`${error.message}\n`);
  });
  /** @type {Promise<{exitCode: number, signal: NodeJS.Signals | null}>} */
  const completion = new Promise((resolveResult) => {
    child.on('close', (code, signal) => {
      signal = requestedSignal ?? signal;
      resolveResult({
        exitCode: signal ? 128 + constants.signals[signal] : startupError ? 1 : (code ?? 1),
        signal,
      });
    });
  });
  const result = await completion;
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
  closeSync(log);
  await finishRun(run, result);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, ...extra] = process.argv.slice(2);
  const vitest = join(projectRoot, 'node_modules/vitest/vitest.mjs');
  const commands = {
    unit: [vitest, 'run'],
    coverage: [vitest, 'run', '--coverage'],
    architecture: [vitest, 'run', 'tests/architecture'],
    watch: [vitest, '--watch'],
    e2e: [join(projectRoot, 'node_modules/@playwright/test/cli.js'), 'test'],
  };
  if (!Object.hasOwn(commands, kind)) {
    console.error(
      'Usage: node scripts/run-tests.mjs <unit|coverage|architecture|watch|e2e> [test options]',
    );
    process.exitCode = 1;
  } else {
    try {
      const result = await runTestCommand({
        kind,
        command: process.execPath,
        args: [...commands[kind], ...extra],
      });
      process.exitCode = result.exitCode;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}
