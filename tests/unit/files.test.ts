// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, readMapFile } from '../../src/adapters/storage/files';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('browser files', () => {
  it('allows the native size budget and rejects oversized native files before reading', async () => {
    const text = vi.fn(async () => '{}');
    await expect(
      readMapFile({ name: 'native.maplet', size: 11 * 1024 * 1024, text } as unknown as File),
    ).resolves.toBe('{}');
    text.mockClear();
    await expect(
      readMapFile({ name: 'native.maplet', size: 51 * 1024 * 1024, text } as unknown as File),
    ).rejects.toThrow(/50/);
    expect(text).not.toHaveBeenCalled();
  });
  it('checks size before reading, even for renamed files', async () => {
    await expect(
      readMapFile({ size: 11 * 1024 * 1024, text: vi.fn() } as unknown as File),
    ).rejects.toThrow(/MibSmaller/);
    await expect(readMapFile({ size: 2, text: async () => '{}' } as File)).resolves.toBe('{}');
  });
  it.each(['mup', 'maplet'])(
    'downloads a sanitized %s filename and releases its object URL',
    (extension) => {
      vi.useFakeTimers();
      const create = vi.fn(() => 'blob:test');
      const revoke = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.download).toBe(`내_맵_.${extension}`);
        expect(this.href).toBe('blob:test');
        expect(document.body.contains(this)).toBe(true);
      });
      downloadFile('{}', `내/맵\u0001.${extension}`);
      expect(click).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledOnce();
      expect(document.querySelector('a')).toBeNull();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:test');
    },
  );
});
