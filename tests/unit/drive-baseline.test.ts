import { expect, it } from 'vitest';
import { parseDriveBaseline } from '../../src/adapters/storage/drive-baseline';
import { createMap } from '../../src/domain/commands';
import { serializeMaplet } from '../../src/adapters/maplet/codec';

const snapshot = { content: serializeMaplet(createMap()), filename: 'map.maplet' };
const baseline = { ...snapshot, fileId: 'file', version: '7' };
it('validates and copies only draft baseline fields including an uncertain write', () => {
  expect(
    parseDriveBaseline({
      ...baseline,
      token: 'discard',
      attempt: { ...snapshot, token: 'discard' },
    }),
  ).toEqual({ ...baseline, attempt: snapshot });
});
it.each([
  null,
  [],
  {},
  { ...baseline, version: '' },
  { ...baseline, content: '{}' },
  { ...baseline, filename: 5 },
])('rejects an untrusted baseline: %j', (value) => {
  expect(parseDriveBaseline(value)).toBeNull();
});
it('discards an invalid uncertain snapshot while keeping a valid baseline', () => {
  expect(
    parseDriveBaseline({ ...baseline, attempt: { content: 'invalid', filename: 'map.maplet' } }),
  ).toEqual(baseline);
});
