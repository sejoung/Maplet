import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

export default class TimingReporter implements Reporter {
  private workers = 0;
  private root = '';
  private seenWorkers = new Set<number>();
  private tests: {
    project: string;
    file: string;
    title: string;
    worker: number;
    firstInWorker: boolean;
    retry: number;
    status: string;
    durationMs: number;
    setupMs: number;
    teardownMs: number;
    phasesMs: Record<string, number>;
    remainingMs: number;
  }[] = [];

  constructor(private readonly options: { outputFile: string }) {}

  onBegin(config: FullConfig) {
    this.workers = config.workers;
    this.root = config.rootDir;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const phasesMs: Record<string, number> = {};
    const visit = (step: TestStep) => {
      if (step.category === 'test.step' && step.title.startsWith('timing:')) {
        const phase = step.title.slice('timing:'.length);
        phasesMs[phase] = (phasesMs[phase] ?? 0) + step.duration;
        return; // Parent phases already include nested calls.
      }
      step.steps.forEach(visit);
    };
    const hookTime = (title: string) =>
      result.steps
        .filter((step) => step.category === 'hook' && step.title === title)
        .reduce((sum, step) => sum + step.duration, 0);
    const setupMs = hookTime('Before Hooks');
    const teardownMs = hookTime('After Hooks');
    // Only test-body phases are subtracted; hooks own their nested work.
    result.steps.filter((step) => step.category !== 'hook').forEach(visit);
    this.tests.push({
      project: test.parent.project()!.name,
      file: relative(this.root, test.location.file),
      title: test.title,
      worker: result.workerIndex,
      firstInWorker: result.workerIndex >= 0 && !this.seenWorkers.has(result.workerIndex),
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
      setupMs,
      teardownMs,
      phasesMs,
      remainingMs: Math.max(
        0,
        result.duration - setupMs - teardownMs - Object.values(phasesMs).reduce((a, b) => a + b, 0),
      ),
    });
    if (result.workerIndex >= 0) this.seenWorkers.add(result.workerIndex);
  }

  onEnd(result: FullResult) {
    mkdirSync(dirname(this.options.outputFile), { recursive: true });
    writeFileSync(
      this.options.outputFile,
      JSON.stringify(
        {
          workers: this.workers,
          status: result.status,
          durationMs: result.duration,
          workerProcesses: this.seenWorkers.size,
          tests: this.tests,
        },
        null,
        2,
      ) + '\n',
    );
  }
}
