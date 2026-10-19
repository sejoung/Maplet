import type { MindMap } from '../domain/model';
import { parseMaplet, MAX_MAPLET_BYTES } from './maplet/codec';
import { parseMup } from './mup/codec';

export function parseDocument(source: string): MindMap {
  if (new TextEncoder().encode(source).byteLength > MAX_MAPLET_BYTES)
    throw new Error('파일 크기는 50 MiB 이하여야 합니다.');
  let format: unknown;
  try {
    format = JSON.parse(source)?.format;
  } catch {
    return parseMup(source);
  }
  return format === 'maplet' ? parseMaplet(source) : parseMup(source);
}

const stem = (name: string) => name.replace(/\.(maplet|mup|json)$/i, '');
export const nativeFilename = (name: string) => `${stem(name)}.maplet`;
export const mupFilename = (name: string) => `${stem(name)}.mup`;

export function driveSaveTarget(
  name: string,
  current: { name: string } | null,
  copy: boolean,
  copyLabel = '사본',
) {
  return {
    create: copy || !current || !/\.maplet$/i.test(current.name),
    name: copy ? nativeFilename(`${stem(name)} (${copyLabel})`) : nativeFilename(name),
  };
}
