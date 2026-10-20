import { expect, it } from 'vitest';
import { DriveSaveBuffer } from '../../src/application/drive-save-buffer';

const snapshot = (content: string) => ({ content, filename: 'map.maplet' });

it('coalesces hundreds of edits into only the latest snapshot after an idle window', () => {
  const buffer = new DriveSaveBuffer();
  for (let i = 0; i < 100; i++) buffer.stage(1, snapshot(String(i)), i * 10);
  expect(buffer.pending).toMatchObject({ content: '99', firstAt: 0, changedAt: 990 });
  expect(buffer.delay(3989)).toBe(1);
  expect(buffer.delay(3990)).toBe(0);
  expect(buffer.stage(1, snapshot('99'), 4000)).toBe(false);
  expect(buffer.pending!.changedAt).toBe(990);
});

it('limits automatic upload frequency even for edits made during the preceding upload', () => {
  const buffer = new DriveSaveBuffer();
  buffer.started(1, 1000);
  buffer.stage(1, snapshot('newer'), 1100);
  expect(buffer.delay(4100)).toBe(1900);
  expect(buffer.delay(5999)).toBe(1);
  expect(buffer.delay(6000)).toBe(0);
  buffer.clear();
  buffer.started(1, 6000);
  buffer.stage(1, snapshot('latest'), 6100);
  expect(buffer.delay(9100)).toBe(1900);
});

it('does not postpone continuous editing beyond the maximum wait', () => {
  const buffer = new DriveSaveBuffer();
  for (let time = 0; time < 15000; time += 500) buffer.stage(1, snapshot(String(time)), time);
  expect(buffer.delay(14999)).toBe(1);
  expect(buffer.delay(15000)).toBe(0);
  expect(buffer.pending!.content).toBe('14500');
});

it('promotes manual saves to immediate and retains that intent while the newest content changes', () => {
  const buffer = new DriveSaveBuffer();
  buffer.started(1, 1000);
  buffer.stage(1, snapshot('first'), 1100);
  buffer.stage(1, snapshot('first'), 1200, true);
  buffer.stage(1, snapshot('latest'), 1300);
  expect(buffer.pending).toMatchObject({ content: 'latest', manual: true });
  expect(buffer.delay(1300)).toBe(0);
  expect(buffer.clear(true)).toBe(false);
  expect(buffer.clear()).toBe(true);
  expect(buffer.delay(1300)).toBe(0);
  expect(buffer.clear()).toBe(false);
});

it('resets the batch on a document change and includes filename changes in the cached snapshot', () => {
  const buffer = new DriveSaveBuffer();
  buffer.stage(1, snapshot('old'), 0);
  buffer.started(1, 1000);
  buffer.stage(2, snapshot('new'), 2000);
  expect(buffer.pending).toMatchObject({ key: 2, firstAt: 2000 });
  expect(buffer.delay(5000)).toBe(0);
  buffer.stage(2, { content: 'new', filename: 'renamed.maplet' }, 4000);
  expect(buffer.delay(5000)).toBe(2000);
  expect(buffer.clear(true)).toBe(true);
});
