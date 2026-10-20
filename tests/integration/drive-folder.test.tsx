import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  prepare: vi.fn(),
  connect: vi.fn(),
  pick: vi.fn(),
  getToken: vi.fn(),
  disconnect: vi.fn(),
}));
const api = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock('../../src/adapters/drive/google', () => ({
  GoogleConnection: class {
    prepare = bridge.prepare;
    connect = bridge.connect;
    pick = bridge.pick;
    getToken = bridge.getToken;
    disconnect = bridge.disconnect;
  },
}));
vi.mock('../../src/adapters/drive/client', async (original) => ({
  ...(await original<typeof import('../../src/adapters/drive/client')>()),
  DriveClient: class {
    open = api.open;
    save = api.save;
    create = api.create;
  },
}));

let useDrive: typeof import('../../src/app/useDrive').useDrive;
beforeAll(async () => {
  for (const name of ['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_API_KEY', 'VITE_GOOGLE_APP_ID'])
    vi.stubEnv(name, 'public-test-setting');
  ({ useDrive } = await import('../../src/app/useDrive'));
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  bridge.prepare.mockResolvedValue(undefined);
  bridge.getToken.mockReturnValue('token');
  bridge.pick.mockResolvedValue({ id: 'folder-A', name: 'Maps A' });
  api.create.mockImplementation(async (name, _content, parent) => ({
    id: `${parent}-file`,
    name,
    version: '1',
    etag: '"v1"',
  }));
});

async function setup() {
  const options = {
    content: 'initial content',
    filename: 'local.maplet',
    documentKey: 0,
    markSaved: vi.fn(),
    allowReplace: () => true,
    replace: vi.fn(),
    setNotice: vi.fn(),
  };
  const view = renderHook(() => useDrive(options));
  await act(async () => view.result.current.showDrive());
  await act(async () => view.result.current.chooseSaveFolder());
  return { ...view, options };
}

it('keeps an existing destination when folder selection is cancelled and switches future writes to a newly chosen folder', async () => {
  const { result, options, rerender } = await setup();
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => result.current.saveDrive());
  expect(result.current.driveFile?.id).toBe('folder-A-file');
  bridge.pick.mockResolvedValueOnce(null);
  await act(async () => result.current.chooseSaveFolder());
  expect(result.current.saveFolder?.id).toBe('folder-A');
  expect(result.current.driveFile?.id).toBe('folder-A-file');
  bridge.pick.mockResolvedValueOnce({ id: 'folder-B', name: 'Maps B' });
  await act(async () => result.current.chooseSaveFolder());
  expect(result.current.driveFile).toBeNull();
  expect(api.create).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  act(() => result.current.closeDialog());
  options.content = 'edit in the new destination';
  rerender();
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(api.create).toHaveBeenLastCalledWith('local.maplet', options.content, 'folder-B');
  expect(result.current.driveFile?.id).toBe('folder-B-file');
  expect(api.save).not.toHaveBeenCalled();
});

it('retains the chosen folder across local document changes and waits for an edit before creating a file', async () => {
  const { result, options, rerender } = await setup();
  vi.useFakeTimers();
  act(() => result.current.closeDialog());
  options.documentKey++;
  options.filename = 'next.maplet';
  options.content = 'new local document';
  rerender();
  act(() => result.current.clearFile(options.content));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(result.current.saveFolder?.id).toBe('folder-A');
  expect(api.create).not.toHaveBeenCalled();
  options.content = 'first edit';
  rerender();
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(api.create).toHaveBeenCalledExactlyOnceWith('next.maplet', 'first edit', 'folder-A');
});

it('does not resume an old file target after disconnecting', async () => {
  const { result, options, rerender } = await setup();
  await act(async () => result.current.saveDrive());
  act(() => result.current.disconnect());
  expect(result.current.saveFolder).toBeNull();
  expect(result.current.driveFile).toBeNull();
  expect(result.current.connected).toBe(false);
  vi.useFakeTimers();
  options.content = 'local edit after disconnecting';
  rerender();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.save).not.toHaveBeenCalled();
});
