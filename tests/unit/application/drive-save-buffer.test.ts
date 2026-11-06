import { expect, it } from 'vitest';
import {
  EMPTY_SAVE_BUFFER,
  clearSave,
  saveDelay,
  stageSave,
  startedSave,
  type SaveBuffer,
} from '../../../src/application/drive-save-buffer';

const snapshot = (content: string) => ({ content, filename: 'map.maplet' });

it('coalesces hundreds of edits into only the latest snapshot after an idle window', () => {
  let buffer = EMPTY_SAVE_BUFFER;
  for (let i = 0; i < 100; i++) buffer = stageSave(buffer, 1, snapshot(String(i)), i * 10);
  expect(buffer.pending).toMatchObject({ content: '99', firstAt: 0, changedAt: 990 });
  expect(saveDelay(buffer, 3989)).toBe(1);
  expect(saveDelay(buffer, 3990)).toBe(0);
  expect(stageSave(buffer, 1, snapshot('99'), 4000)).toBe(buffer);
  expect(buffer.pending!.changedAt).toBe(990);
});

it('limits automatic upload frequency even for edits made during the preceding upload', () => {
  let buffer = startedSave(EMPTY_SAVE_BUFFER, 1, 1000);
  buffer = stageSave(buffer, 1, snapshot('newer'), 1100);
  expect(saveDelay(buffer, 4100)).toBe(1900);
  expect(saveDelay(buffer, 5999)).toBe(1);
  expect(saveDelay(buffer, 6000)).toBe(0);
  buffer = startedSave(clearSave(buffer), 1, 6000);
  buffer = stageSave(buffer, 1, snapshot('latest'), 6100);
  expect(saveDelay(buffer, 9100)).toBe(1900);
});

it('does not postpone continuous editing beyond the maximum wait', () => {
  let buffer = EMPTY_SAVE_BUFFER;
  for (let time = 0; time < 15000; time += 500)
    buffer = stageSave(buffer, 1, snapshot(String(time)), time);
  expect(saveDelay(buffer, 14999)).toBe(1);
  expect(saveDelay(buffer, 15000)).toBe(0);
  expect(buffer.pending!.content).toBe('14500');
});

it('promotes manual saves to immediate and retains that intent while the newest content changes', () => {
  let buffer = startedSave(EMPTY_SAVE_BUFFER, 1, 1000);
  buffer = stageSave(buffer, 1, snapshot('first'), 1100);
  buffer = stageSave(buffer, 1, snapshot('first'), 1200, true);
  buffer = stageSave(buffer, 1, snapshot('latest'), 1300);
  expect(buffer.pending).toMatchObject({ content: 'latest', manual: true });
  expect(saveDelay(buffer, 1300)).toBe(0);
  expect(clearSave(buffer, true)).toBe(buffer);
  const cleared = clearSave(buffer);
  expect(cleared.pending).toBeNull();
  expect(saveDelay(cleared, 1300)).toBe(0);
  expect(clearSave(cleared)).toBe(cleared);
});

it('resets the batch on a document change and includes filename changes in the cached snapshot', () => {
  let buffer: SaveBuffer = stageSave(EMPTY_SAVE_BUFFER, 1, snapshot('old'), 0);
  buffer = startedSave(buffer, 1, 1000);
  buffer = stageSave(buffer, 2, snapshot('new'), 2000);
  expect(buffer.pending).toMatchObject({ key: 2, firstAt: 2000 });
  expect(saveDelay(buffer, 5000)).toBe(0);
  buffer = stageSave(buffer, 2, { content: 'new', filename: 'renamed.maplet' }, 4000);
  expect(saveDelay(buffer, 5000)).toBe(2000);
  expect(clearSave(buffer, true).pending).toBeNull();
});

it('never changes a buffer it is given', () => {
  const buffer = Object.freeze(stageSave(EMPTY_SAVE_BUFFER, 1, snapshot('a'), 0));
  stageSave(buffer, 1, snapshot('b'), 10, true);
  startedSave(buffer, 1, 20);
  clearSave(buffer);
  expect(buffer.pending).toMatchObject({ content: 'a', manual: false });
  expect(EMPTY_SAVE_BUFFER).toEqual({ pending: null, lastStarted: null });
});
