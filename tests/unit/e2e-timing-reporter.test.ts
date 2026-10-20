import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import type {
  FullConfig,
  FullResult,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import TimingReporter from '../../scripts/e2e-timing-reporter';

const step = (title: string, duration: number, steps: TestStep[] = [], category = 'test.step') =>
  ({ title, duration, steps, category }) as TestStep;
const testCase = {
  title: 'Example',
  location: { file: '/repo/tests/e2e/editor.spec.ts' },
  parent: { project: () => ({ name: 'firefox' }) },
} as unknown as TestCase;
const result = (fields: Partial<TestResult> = {}) =>
  ({
    duration: 100,
    workerIndex: 3,
    retry: 0,
    status: 'passed',
    steps: [],
    ...fields,
  }) as TestResult;

async function record(run: (reporter: TimingReporter) => void) {
  const root = await mkdtemp(join(tmpdir(), 'maplet-timings-'));
  try {
    const outputFile = join(root, 'nested', 'timings.json');
    const reporter = new TimingReporter({ outputFile });
    reporter.onBegin({ workers: 4, rootDir: '/repo/tests/e2e' } as FullConfig);
    run(reporter);
    reporter.onEnd({ status: 'passed', duration: 500 } as FullResult);
    return JSON.parse(await readFile(outputFile, 'utf8'));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

it('separates setup, teardown and body phases without counting nested steps twice', async () => {
  const report = await record((reporter) => {
    reporter.onTestEnd(
      testCase,
      result({
        steps: [
          step('Before Hooks', 10, [step('timing:load', 8)], 'hook'),
          step('timing:import', 20, [step('timing:load', 15)]),
          step('outer', 30, [step('timing:import', 5)]),
          step('After Hooks', 5, [], 'hook'),
        ],
      }),
    );
  });
  expect(report).toMatchObject({ workers: 4, durationMs: 500, workerProcesses: 1 });
  expect(report.tests).toEqual([
    expect.objectContaining({
      file: 'editor.spec.ts',
      project: 'firefox',
      setupMs: 10,
      teardownMs: 5,
      phasesMs: { import: 25 },
      remainingMs: 60,
      firstInWorker: true,
    }),
  ]);
});

it('preserves failed attempts and retries and counts only real worker processes', async () => {
  const report = await record((reporter) => {
    reporter.onTestEnd(testCase, result({ status: 'failed' }));
    reporter.onTestEnd(testCase, result({ retry: 1, workerIndex: 4 }));
    reporter.onTestEnd(testCase, result({ workerIndex: 4 }));
    reporter.onTestEnd(testCase, result({ status: 'skipped', workerIndex: -1, duration: 0 }));
  });
  expect(report.workerProcesses).toBe(2);
  expect(report.tests.map((test: { firstInWorker: boolean }) => test.firstInWorker)).toEqual([
    true,
    true,
    false,
    false,
  ]);
  expect(report.tests[0]).toMatchObject({ status: 'failed', retry: 0 });
  expect(report.tests[1]).toMatchObject({ status: 'passed', retry: 1 });
});
