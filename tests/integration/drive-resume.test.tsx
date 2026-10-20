import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createMap, renameNode } from '../../src/domain/commands';
import { serializeMaplet } from '../../src/adapters/maplet/codec';
import {
  writeDriveWorkspace,
  readDriveWorkspace,
} from '../../src/adapters/storage/drive-workspace';

const bridge = vi.hoisted(() => ({
  prepare: vi.fn(),
  connect: vi.fn(),
  pick: vi.fn(),
  getToken: vi.fn(),
  disconnect: vi.fn(),
  clearToken: vi.fn(),
}));
const api = vi.hoisted(() => ({ open: vi.fn(), folder: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock('../../src/adapters/drive/google', () => ({
  GoogleConnection: class {
    prepare = bridge.prepare;
    connect = bridge.connect;
    pick = bridge.pick;
    getToken = bridge.getToken;
    disconnect = bridge.disconnect;
    clearToken = bridge.clearToken;
  },
}));
vi.mock('../../src/adapters/drive/client', async (original) => ({
  ...(await original<typeof import('../../src/adapters/drive/client')>()),
  DriveClient: class {
    open = api.open;
    folder = api.folder;
    save = api.save;
    create = api.create;
  },
}));
const map = createMap('Saved map');
const saved = serializeMaplet(map);
const workspace = {
  folder: { id: 'folder', name: 'Maps' },
  file: { id: 'file', name: 'saved.maplet', version: '7', etag: '"7"', parents: ['folder'] },
  source: null,
};
let useDrive: typeof import('../../src/app/useDrive').useDrive;
beforeAll(async () => {
  for (const name of ['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_API_KEY', 'VITE_GOOGLE_APP_ID'])
    vi.stubEnv(name, 'client');
  ({ useDrive } = await import('../../src/app/useDrive'));
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  writeDriveWorkspace('client', workspace);
  bridge.prepare.mockResolvedValue(undefined);
  bridge.getToken.mockReturnValue(null);
  bridge.connect.mockImplementation(async () => bridge.getToken.mockReturnValue('token'));
  api.folder.mockResolvedValue(workspace.folder);
  api.open.mockResolvedValue({ ...workspace.file, content: saved });
  api.save.mockResolvedValue({ ...workspace.file, version: '8', etag: '"8"' });
});
async function setup() {
  const options = {
    content: serializeMaplet(createMap('Blank')),
    filename: 'saved.maplet',
    documentKey: 0,
    markSaved: vi.fn(),
    allowReplace: vi.fn(() => true),
    replace: vi.fn(),
    setNotice: vi.fn(),
  };
  const view = renderHook(() => useDrive(options));
  await act(async () => view.result.current.showDrive());
  return { ...view, options };
}

it('shows remembered metadata without authorizing or accessing Drive, then reopens it without Picker', async () => {
  const { result, options, rerender } = await setup();
  expect(result.current.saveFolder).toEqual(workspace.folder);
  expect(result.current.rememberedFile).toEqual(workspace.file);
  expect(result.current.connected).toBe(false);
  expect(bridge.connect).not.toHaveBeenCalled();
  expect(api.open).not.toHaveBeenCalled();
  vi.useFakeTimers();
  await act(async () => result.current.resumeDrive());
  expect(api.folder).toHaveBeenCalledWith('folder');
  expect(options.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      roots: ['root'],
      nodes: expect.objectContaining({ root: expect.objectContaining({ title: 'Saved map' }) }),
    }),
    'saved.maplet',
  );
  expect(bridge.pick).not.toHaveBeenCalled();
  expect(result.current.driveFile?.id).toBe('file');
  options.content = serializeMaplet(renameNode(map, map.roots[0], 'New edit'));
  rerender();
  await act(() => vi.advanceTimersByTimeAsync(5100));
  expect(api.save).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: 'file', version: '7' }),
    options.content,
    false,
  );
  expect(api.create).not.toHaveBeenCalled();
});

it('keeps recovered local edits and resumes against their original version', async () => {
  const { result, options, rerender } = await setup();
  options.content = serializeMaplet(renameNode(map, map.roots[0], 'Recovered edit'));
  rerender();
  act(() => result.current.restoreDraftWorkspace(workspace));
  vi.useFakeTimers();
  await act(async () => result.current.resumeDrive());
  expect(options.replace).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(5100));
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ version: '7' }),
    options.content,
    false,
  );
});

it('does not overwrite a remote change after recovering a local draft', async () => {
  const { result, options, rerender } = await setup();
  options.content = serializeMaplet(renameNode(map, map.roots[0], 'Local edit'));
  rerender();
  act(() => result.current.restoreDraftWorkspace(workspace));
  api.open.mockResolvedValueOnce({ ...workspace.file, version: '9', content: saved });
  await act(async () => result.current.resumeDrive());
  expect(result.current.dialog).toBe('conflict');
  expect(options.replace).not.toHaveBeenCalled();
  vi.useFakeTimers();
  act(() => result.current.closeDialog());
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api.save).not.toHaveBeenCalled();
  expect(api.create).not.toHaveBeenCalled();
});

it('keeps remembered metadata after cancelled authentication and allows retry', async () => {
  const { result } = await setup();
  bridge.connect.mockRejectedValueOnce(new Error('Cancelled login'));
  await act(async () => result.current.resumeDrive());
  expect(result.current.rememberedFile?.id).toBe('file');
  expect(api.open).not.toHaveBeenCalled();
  await act(async () => result.current.resumeDrive());
  expect(result.current.driveFile?.id).toBe('file');
});

it('recognizes local content already saved remotely and refreshes its version without writing', async () => {
  const { result, options, rerender } = await setup();
  options.content = saved;
  rerender();
  act(() => result.current.restoreDraftWorkspace(workspace));
  api.open.mockResolvedValueOnce({ ...workspace.file, version: '9', content: saved });
  await act(async () => result.current.resumeDrive());
  expect(result.current.driveFile?.version).toBe('9');
  expect(options.markSaved).toHaveBeenCalledWith(saved);
  expect(options.replace).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});

it('creates a copy in the remembered folder if the original file has moved elsewhere', async () => {
  const { result, options, rerender } = await setup();
  options.content = serializeMaplet(renameNode(map, map.roots[0], 'Recovered edit'));
  options.filename = 'saved.maplet';
  rerender();
  act(() => result.current.restoreDraftWorkspace(workspace));
  api.open.mockResolvedValueOnce({ ...workspace.file, parents: ['elsewhere'], content: saved });
  api.create.mockResolvedValueOnce({ ...workspace.file, id: 'copy' });
  vi.useFakeTimers();
  await act(async () => result.current.resumeDrive());
  await act(() => vi.advanceTimersByTimeAsync(5100));
  expect(api.create).toHaveBeenCalledExactlyOnceWith(
    'saved.maplet',
    options.content,
    'folder',
    expect.any(String),
  );
  expect(api.save).not.toHaveBeenCalled();
});

it('retains copy semantics for a recovered source that was never an update target', async () => {
  const sourceOnly = { ...workspace, file: null, source: workspace.file };
  writeDriveWorkspace('client', sourceOnly);
  const { result, options, rerender } = await setup();
  options.content = serializeMaplet(renameNode(map, map.roots[0], 'Recovered imported file'));
  options.filename = 'saved.maplet';
  rerender();
  act(() => result.current.restoreDraftWorkspace(sourceOnly));
  api.open.mockResolvedValueOnce({ ...workspace.file, version: '9', content: saved });
  api.create.mockResolvedValueOnce({ ...workspace.file, id: 'copy' });
  vi.useFakeTimers();
  await act(async () => result.current.resumeDrive());
  await act(() => vi.advanceTimersByTimeAsync(5100));
  expect(api.create).toHaveBeenCalledExactlyOnceWith(
    'saved.maplet',
    options.content,
    'folder',
    expect.any(String),
  );
  expect(api.save).not.toHaveBeenCalled();
  expect(options.replace).not.toHaveBeenCalled();
});

it('does not restore an old target after creating another document or explicitly disconnecting', async () => {
  const { result, options, rerender } = await setup();
  act(() => result.current.clearFile());
  expect(result.current.rememberedFile).toBeNull();
  vi.useFakeTimers();
  await act(async () => result.current.resumeDrive());
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api.create).not.toHaveBeenCalled();
  expect(api.open).not.toHaveBeenCalled();
  expect(options.replace).not.toHaveBeenCalled();
  await act(async () => result.current.disconnect());
  expect(readDriveWorkspace('client')).toBeNull();
  act(() => result.current.restoreDraftWorkspace(workspace));
  expect(result.current.saveFolder).toBeNull();
  vi.useFakeTimers();
  options.content = 'later local edit';
  rerender();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api.save).not.toHaveBeenCalled();
  expect(api.create).not.toHaveBeenCalled();
});

it('ignores completion after the user switches documents during reconnection', async () => {
  const { result, options, rerender } = await setup();
  let finish!: (value: object) => void;
  api.open.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let resume!: Promise<void>;
  await act(async () => {
    resume = result.current.resumeDrive();
  });
  options.documentKey++;
  rerender();
  act(() => result.current.clearFile());
  await act(async () => {
    finish({ ...workspace.file, content: saved });
    await resume;
  });
  expect(options.replace).not.toHaveBeenCalled();
  expect(result.current.driveFile).toBeNull();
});
