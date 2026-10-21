import type { MindMap } from '../domain/model';
import { stripMapExtension } from '../domain/filename';
import { parseFiniteJson } from '../domain/json';
import { AppError } from '../domain/errors';
import { mapletFromJson } from './maplet/codec';
import { MUP_JSON_ERROR, mupFromJson } from './mup/codec';
import { assertSize, MAX_MAPLET_BYTES, MAX_MUP_BYTES, utf8Length } from './limits';

/** Detect the format from one parse; each format keeps its own size limit. */
export function parseDocument(source: string): MindMap {
  const bytes = utf8Length(source);
  assertSize(bytes, MAX_MAPLET_BYTES);
  let raw: unknown;
  try {
    raw = parseFiniteJson(source);
  } catch {
    throw new AppError(MUP_JSON_ERROR);
  }
  if ((raw as { format?: unknown } | null)?.format === 'maplet') return mapletFromJson(raw);
  assertSize(bytes, MAX_MUP_BYTES);
  return mupFromJson(raw, source);
}

export const nativeFilename = (name: string) => `${stripMapExtension(name)}.maplet`;
export const mupFilename = (name: string) => `${stripMapExtension(name)}.mup`;

export function driveSaveTarget(
  name: string,
  current: { name: string } | null,
  copy: boolean,
  copyLabel = '사본',
) {
  return {
    create: copy || !current || !/\.maplet$/i.test(current.name),
    name: copy ? nativeFilename(`${stripMapExtension(name)} (${copyLabel})`) : nativeFilename(name),
  };
}
