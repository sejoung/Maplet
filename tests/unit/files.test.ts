import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, readMapFile } from '../../src/adapters/storage/files';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('browser files', () => {
  it('checks size before reading, even for renamed files', async () => {
    await expect(
      readMapFile({ size: 11 * 1024 * 1024, text: vi.fn() } as unknown as File),
    ).rejects.toThrow(/크기/);
    await expect(readMapFile({ size: 2, text: async () => '{}' } as File)).resolves.toBe('{}');
  });
  it('downloads a sanitized local filename and releases its object URL', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('내_맵_.mup');
      expect(this.href).toBe('blob:test');
      expect(document.body.contains(this)).toBe(true);
    });
    downloadFile('{}', '내/맵\u0001.mup');
    expect(click).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
