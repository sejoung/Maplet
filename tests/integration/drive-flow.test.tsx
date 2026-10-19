import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DriveDialogs } from '../../src/app/DriveDialogs';
import { DriveConflict } from '../../src/adapters/drive/client';

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
vi.mock('../../src/adapters/drive/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/adapters/drive/client')>()),
  DriveClient: class {
    open = api.open;
    save = api.save;
    create = api.create;
  },
}));

let useDrive: typeof import('../../src/app/useDrive').useDrive;
beforeAll(async () => {
  for (const name of ['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_API_KEY', 'VITE_GOOGLE_APP_ID']) {
    vi.stubEnv(name, 'public-test-setting');
  }
  ({ useDrive } = await import('../../src/app/useDrive'));
});

describe('Drive autosave after choosing a native destination', () => {
  async function ready() {
    const result = await setup();
    await result.user.click(screen.getByRole('button', { name: '저장 위치 선택' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    vi.useFakeTimers();
    return result;
  }
  const tick = (ms = 1500) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('debounces changes and saves the latest committed content to the same native file', async () => {
    const { options, refresh } = await ready();
    options.content = 'first edit';
    refresh();
    await tick(1000);
    options.content = 'latest edit';
    refresh();
    await tick(1499);
    expect(api.save).not.toHaveBeenCalled();
    await tick(1);
    expect(api.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'created', name: 'local.maplet' }),
      'latest edit',
      false,
    );
    expect(options.markSaved).toHaveBeenLastCalledWith('latest edit');
    expect(bridge.pick).toHaveBeenCalledOnce();
    expect(bridge.connect).toHaveBeenCalledOnce();
  });

  it('serializes writes and queues edits made during an in-flight save with the new file version', async () => {
    const { options, refresh } = await ready();
    let complete!: (value: object) => void;
    api.save.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    options.content = 'snapshot A';
    refresh();
    await tick();
    options.content = 'snapshot B';
    refresh();
    await tick(5000);
    expect(api.save).toHaveBeenCalledOnce();
    await act(async () => {
      complete({ id: 'created', name: 'local.maplet', version: '2', etag: '"v2"' });
    });
    expect(options.markSaved).toHaveBeenLastCalledWith('snapshot A');
    await tick();
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: '2', etag: '"v2"' }),
      'snapshot B',
      false,
    );
    expect(options.markSaved).toHaveBeenLastCalledWith('snapshot B');
  });

  it('pauses on conflict and keeps unsaved content without an automatic overwrite or retry', async () => {
    const { options, refresh } = await ready();
    api.save.mockRejectedValueOnce(new DriveConflict());
    options.content = 'conflicting edit';
    refresh();
    await tick();
    expect(screen.getByRole('dialog', { name: 'Drive 파일을 확인해 주세요.' })).toBeVisible();
    act(() => screen.getByRole('button', { name: '편집으로 돌아가기' }).click());
    options.content = 'another edit';
    refresh();
    await tick(10000);
    expect(api.save).toHaveBeenCalledOnce();
    expect(options.markSaved).toHaveBeenLastCalledWith('local content');
    expect(screen.getByText('Drive 자동 저장 중지')).toBeVisible();
  });

  it('pauses an expired token without opening sign-in automatically', async () => {
    const { options, refresh } = await ready();
    bridge.getToken.mockReturnValue(null);
    options.content = 'offline edit';
    refresh();
    await tick();
    expect(api.save).not.toHaveBeenCalled();
    expect(bridge.connect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Drive 자동 저장 중지')).toBeVisible();
    await tick(10000);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('ignores an old save completion after switching to a different local document', async () => {
    const { options, refresh } = await ready();
    let complete!: (value: object) => void;
    api.save.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    options.content = 'old edit';
    refresh();
    await tick();
    options.documentKey++;
    options.content = 'new document';
    refresh();
    act(() => screen.getByRole('button', { name: 'Clear file' }).click());
    await act(async () => {
      complete({ id: 'created', name: 'local.maplet', version: '2', etag: '"v2"' });
    });
    await tick(10000);
    expect(api.save).toHaveBeenCalledOnce();
    expect(options.markSaved).toHaveBeenLastCalledWith('local content');
    expect(screen.queryByText('Drive에 저장됨')).not.toBeInTheDocument();
  });
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.resetAllMocks();
  bridge.prepare.mockResolvedValue(undefined);
  bridge.getToken.mockReturnValue(null);
  bridge.connect.mockImplementation(async () => {
    bridge.getToken.mockReturnValue('token');
  });
  bridge.pick.mockResolvedValue('selected-id');
  api.open.mockResolvedValue({
    id: 'selected-id',
    name: 'opened.maplet',
    version: '1',
    etag: '"v1"',
    content: '{"id":1,"title":"From Drive"}',
  });
  api.create.mockResolvedValue({ id: 'created', name: 'local.maplet', version: '1', etag: '"v1"' });
  api.save.mockResolvedValue({ id: 'created', name: 'local.maplet', version: '2', etag: '"v2"' });
});

async function setup(allowReplace = true) {
  const options = {
    content: 'local content',
    filename: 'local.maplet',
    documentKey: 0,
    markSaved: vi.fn(),
    allowReplace: vi.fn(() => allowReplace),
    replace: vi.fn(),
    setNotice: vi.fn(),
  };
  function Harness() {
    const controller = useDrive(options);
    return (
      <>
        <button onClick={controller.showDrive}>Drive</button>
        <button onClick={controller.clearFile}>Clear file</button>
        <span>{controller.autoSaveStatus}</span>
        <DriveDialogs controller={controller} save={() => {}} />
      </>
    );
  }
  const view = render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Drive' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Drive에서 열기' })).toBeEnabled());
  return { user, options, refresh: () => view.rerender(<Harness />) };
}

describe('Drive actions continue through sign-in and selection', () => {
  it('opens the file picker immediately after authorization without another click', async () => {
    const { user, options } = await setup();
    let resolveConsent = () => {};
    const consent = new Promise<void>((resolve) => {
      resolveConsent = resolve;
    });
    bridge.connect.mockImplementationOnce(() =>
      consent.then(() => {
        bridge.getToken.mockReturnValue('token');
      }),
    );
    expect(screen.queryByRole('button', { name: 'Google에 연결' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    expect(bridge.connect).toHaveBeenCalledOnce();
    expect(bridge.pick).not.toHaveBeenCalled();
    resolveConsent();
    await waitFor(() => expect(options.replace).toHaveBeenCalledOnce());
    expect(bridge.pick).toHaveBeenCalledOnce();
    expect(api.open).toHaveBeenCalledWith('selected-id');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('authorizes then saves in the selected folder, and updates that file next time', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: '저장 위치 선택' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith('local.maplet', 'local content', 'selected-id'),
    );
    expect(bridge.pick).toHaveBeenCalledWith('folder', 'ko');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Drive' }));
    await user.click(screen.getByRole('button', { name: 'Drive에 저장' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(bridge.connect).toHaveBeenCalledOnce();
    expect(bridge.pick).toHaveBeenCalledOnce();
    expect(api.create).toHaveBeenCalledOnce();
  });

  it.each(['file', 'folder'])(
    'cancels %s selection without reading or writing a file',
    async (kind) => {
      const { user, options } = await setup();
      bridge.pick.mockResolvedValueOnce(null);
      await user.click(
        screen.getByRole('button', {
          name: kind === 'file' ? 'Drive에서 열기' : '저장 위치 선택',
        }),
      );
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('취소'));
      expect(api.open).not.toHaveBeenCalled();
      expect(api.create).not.toHaveBeenCalled();
      expect(api.save).not.toHaveBeenCalled();
      expect(options.replace).not.toHaveBeenCalled();
      expect(options.setNotice).not.toHaveBeenCalled();
    },
  );

  it('displays authorization errors and can retry the same action', async () => {
    const { user, options } = await setup();
    bridge.connect.mockRejectedValueOnce(new Error('로그인 창이 닫혔습니다.'));
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 창이 닫혔습니다.');
    expect(bridge.pick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    await waitFor(() => expect(options.replace).toHaveBeenCalledOnce());
  });

  it('reconnects an expired token and continues the requested action', async () => {
    const { user, options } = await setup();
    bridge.pick.mockResolvedValueOnce(null);
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('취소'));
    bridge.getToken.mockReturnValue(null);
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    await waitFor(() => expect(options.replace).toHaveBeenCalledOnce());
    expect(bridge.connect).toHaveBeenCalledTimes(2);
  });

  it('keeps conflict handling and chooses a new folder for a separate copy', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: '저장 위치 선택' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Drive' }));
    api.save.mockRejectedValueOnce(new DriveConflict());
    await user.click(screen.getByRole('button', { name: 'Drive에 저장' }));
    expect(
      await screen.findByRole('dialog', { name: 'Drive 파일을 확인해 주세요.' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '새 사본으로 저장' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenLastCalledWith(
        'local (사본).maplet',
        'local content',
        'selected-id',
      ),
    );
    expect(bridge.pick).toHaveBeenCalledTimes(2);
  });

  it('respects the confirmation before replacing unsaved local work', async () => {
    const { user, options } = await setup(false);
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    expect(options.allowReplace).toHaveBeenCalledOnce();
    expect(bridge.connect).not.toHaveBeenCalled();
    expect(bridge.pick).not.toHaveBeenCalled();
    expect(options.replace).not.toHaveBeenCalled();
  });

  it('imports MUP as a native document, creates a .maplet file and updates only that copy', async () => {
    const { user, options } = await setup();
    api.open.mockResolvedValueOnce({
      id: 'source-mup',
      name: 'source.mup',
      version: '1',
      etag: '"mup-v1"',
      content: '{"id":1,"title":"MUP source"}',
    });
    await user.click(screen.getByRole('button', { name: 'Drive에서 열기' }));
    await waitFor(() => expect(options.replace).toHaveBeenCalledOnce());
    const [map, name] = options.replace.mock.calls[0] as unknown as [
      import('../../src/domain/model').MindMap,
      string,
    ];
    expect(name).toBe('source.maplet');
    const { serializeMaplet } = await import('../../src/adapters/maplet/codec');
    options.content = serializeMaplet(map);
    options.filename = name;
    api.create.mockResolvedValueOnce({
      id: 'native-copy',
      name,
      version: '1',
      etag: '"native-v1"',
    });
    await user.click(screen.getByRole('button', { name: 'Drive' }));
    await user.click(screen.getByRole('button', { name: '저장 위치 선택' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(name, options.content, 'selected-id'),
    );
    expect(JSON.parse(api.create.mock.calls[0][1])).toMatchObject({ format: 'maplet', version: 1 });
    expect(api.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Drive' }));
    await user.click(screen.getByRole('button', { name: 'Drive에 저장' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'native-copy', name: 'source.maplet' }),
        options.content,
        false,
      ),
    );
    expect(api.create).toHaveBeenCalledOnce();
  });
});
