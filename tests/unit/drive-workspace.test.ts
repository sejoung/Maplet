import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  parseDriveWorkspace,
  readDriveWorkspace,
  writeDriveWorkspace,
} from '../../src/adapters/storage/drive-workspace';

const workspace = {
  folder: { id: 'folder', name: 'Maps' },
  file: { id: 'file', name: 'map.maplet', version: '7', etag: '"7"', parents: ['folder'] },
  source: null,
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it('remembers only file and folder metadata, scoped to the Google client', () => {
  const extra = {
    ...workspace,
    access_token: 'secret',
    content: 'private map',
    file: { ...workspace.file, content: 'private map', token: 'secret' },
  };
  writeDriveWorkspace('client', extra);
  expect(readDriveWorkspace('client')).toEqual(workspace);
  expect(readDriveWorkspace('other-client')).toBeNull();
  expect(localStorage.getItem('maplet:drive:client')).not.toMatch(/secret|private map/);
  writeDriveWorkspace('client', null);
  expect(readDriveWorkspace('client')).toBeNull();
});
it.each([
  null,
  {},
  { folder: { id: 3, name: 'Maps' } },
  { ...workspace, file: { id: 'incomplete' } },
  { ...workspace, source: { id: 'incomplete' } },
])('ignores malformed saved metadata: %j', (value) => {
  expect(parseDriveWorkspace(value)).toBeNull();
});
it('handles invalid JSON and unavailable browser storage without breaking editing', () => {
  localStorage.setItem('maplet:drive:client', '{');
  expect(readDriveWorkspace('client')).toBeNull();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readDriveWorkspace('client')).toBeNull();
  expect(() => writeDriveWorkspace('client', workspace)).not.toThrow();
  expect(() => writeDriveWorkspace('client', null)).not.toThrow();
});
