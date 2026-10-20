// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDriveSaving } from '../../src/app/useDriveSaving';
import { DriveClient } from '../../src/adapters/drive/client';
import { createMap } from '../../src/domain/commands';
import { serializeMaplet } from '../../src/adapters/maplet/codec';

it.each(['success', 'failure'])(
  'preserves a new document save queued behind an old document %s',
  async (outcome) => {
    let finish!: () => void;
    const first = new Promise<object>((resolve, reject) => {
      finish = () =>
        outcome === 'success'
          ? resolve({ id: 'old', name: 'map.maplet', version: '2', etag: null })
          : reject(new Error('Old failure'));
    });
    const api = {
      save: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValue({ id: 'new', name: 'map.maplet', version: '2', etag: null }),
    };
    const success = vi.fn(),
      failure = vi.fn();
    const content = serializeMaplet(createMap('Current'));
    const { result, rerender } = renderHook(
      ({ key }) => {
        const [busy, setBusy] = useState(false);
        const inFlight = useRef(false),
          generation = useRef(0);
        return useDriveSaving({
          content,
          filename: 'map.maplet',
          documentKey: key,
          drive: api as unknown as DriveClient,
          folder: { id: 'folder', name: 'Folder' },
          file: { id: key === 0 ? 'old' : 'new', name: 'map.maplet', version: '1', etag: null },
          baseline: null,
          busy,
          blocked: false,
          paused: false,
          dirty: true,
          inFlight,
          generation,
          copyLabel: 'Copy',
          authorize: async () => {},
          pickFolder: async () => null,
          begin: () => setBusy(true),
          finish: () => setBusy(false),
          unchanged: vi.fn(),
          success,
          fail: failure,
          resolved: vi.fn(),
          rebase: vi.fn(),
        });
      },
      { initialProps: { key: 0 } },
    );
    let original!: Promise<void>;
    await act(async () => {
      original = result.current.save();
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    rerender({ key: 1 });
    await act(async () => {
      await result.current.save();
    });
    await act(async () => {
      finish();
      await original;
    });
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][0].id).toBe('new');
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0].file.id).toBe('new');
    expect(failure).not.toHaveBeenCalled();
  },
);
