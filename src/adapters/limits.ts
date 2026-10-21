import { AppError } from '../domain/errors';

const MiB = 1024 * 1024;
export const MAX_MUP_BYTES = 10 * MiB;
export const MAX_MAPLET_BYTES = 50 * MiB;

export const isMupName = (name: string) => /\.mup$/i.test(name);
export const byteLimitFor = (name: string) => (isMupName(name) ? MAX_MUP_BYTES : MAX_MAPLET_BYTES);

/** UTF-8 size without allocating an encoded copy of a document that may be 50 MiB. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        bytes += 4;
        index++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function assertSize(
  bytes: number,
  limit: number,
  key = '파일 크기는 {limit} MiB 이하여야 합니다.',
): void {
  if (bytes > limit) throw new AppError(key, { limit: limit / MiB });
}
