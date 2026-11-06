import { describe, expect, it } from 'vitest';
import {
  editDecision,
  flushDecision,
  requestDecision,
  savable,
  upToDate,
} from '../../src/application/drive-save-decision';

const synced = { hasFolder: true, blocked: false, paused: false, dirty: false, hasFile: true };
const edited = { ...synced, dirty: true };

describe('shared save rules', () => {
  it('treats a clean document with a file and running autosave as up to date', () => {
    expect(upToDate(synced)).toBe(true);
    expect(upToDate(edited)).toBe(false);
    expect(upToDate({ ...synced, hasFile: false })).toBe(false);
    // A paused autosave must be able to retry even an unchanged document.
    expect(upToDate({ ...synced, paused: true })).toBe(false);
  });
  it('needs a folder and no pending restore; only explicit saves run while paused', () => {
    expect(savable(edited, false)).toBe(true);
    expect(savable({ ...edited, hasFolder: false }, true)).toBe(false);
    expect(savable({ ...edited, blocked: true }, true)).toBe(false);
    expect(savable({ ...edited, paused: true }, false)).toBe(false);
    expect(savable({ ...edited, paused: true }, true)).toBe(true);
  });
});

describe('after a render', () => {
  const state = { ...edited, autosave: true, uploading: false };
  it.each([
    [{}, 'stage'],
    [{ uploading: true }, 'clear'],
    [{ dirty: false }, 'clear'],
    [{ autosave: false }, 'clearAutomatic'],
    [{ paused: true }, 'clearAutomatic'],
    [{ blocked: true }, 'clearAutomatic'],
    [{ hasFolder: false }, 'clearAutomatic'],
  ] as const)('%o → %s', (change, expected) => {
    expect(editDecision({ ...state, ...change })).toBe(expected);
  });
});

describe('a save request', () => {
  const request = {
    ...edited,
    mode: 'normal' as const,
    automatic: false,
    waiting: false,
    locked: false,
    hasDrive: true,
  };
  it.each([
    [{}, 'run'],
    [{ waiting: true }, 'queue'],
    [{ waiting: true, mode: 'copy' }, 'skip'],
    [{ locked: true }, 'skip'],
    [{ hasDrive: false }, 'skip'],
    [{ blocked: true }, 'skip'],
    [{ automatic: true, paused: true }, 'skip'],
    [{ paused: true }, 'run'],
    [{ dirty: false }, 'unchanged'],
    [{ dirty: false, mode: 'copy' }, 'run'],
    [{ dirty: false, mode: 'overwrite' }, 'run'],
  ] as const)('%o → %s', (change, expected) => {
    expect(requestDecision({ ...request, ...change })).toBe(expected);
  });
});

describe('a due buffered save', () => {
  const due = { ...edited, manual: false, sameDocument: true };
  it.each([
    [{}, 'run'],
    [{ sameDocument: false }, 'drop'],
    [{ paused: true }, 'drop'],
    [{ paused: true, manual: true }, 'run'],
    [{ blocked: true, manual: true }, 'drop'],
    [{ hasFolder: false }, 'drop'],
    [{ dirty: false }, 'drop'],
  ] as const)('%o → %s', (change, expected) => {
    expect(flushDecision({ ...due, ...change })).toBe(expected);
  });
});
