import { MAX_DEPTH, MAX_NODE_COUNT } from '../domain/model';
import { AppError, formatCount } from '../domain/errors';
import { depthLimit } from '../domain/invariants';
import { parseFiniteJson } from '../domain/json';
import { safeUrl } from '../domain/commands';

/** What an imported document may contain; every format reports a limit with the same key. */
const MiB = 1024 * 1024;
export const MAX_MUP_BYTES = 10 * MiB;
export const MAX_MAPLET_BYTES = 50 * MiB;
export const UNSAFE_LINK_WARNING = 'file.unsafeLinksRemoved';

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

export function assertSize(bytes: number, limit: number, key = 'file.filesMustMibSmaller'): void {
  if (bytes > limit) throw new AppError(key, { limit: limit / MiB });
}

/** Messages for a JSON document that is too large or does not parse. */
export interface JsonErrors {
  sizeKey: string;
  jsonKey: string;
}
export const GENERIC_JSON: JsonErrors = {
  sizeKey: 'file.filesMustMibSmaller',
  jsonKey: 'file.invalidJson',
};

/** Parse untrusted JSON, rejecting non-finite numbers such as `1e999`. */
export function parseJson(source: string, jsonKey: string): unknown {
  try {
    return parseFiniteJson(source);
  } catch {
    throw new AppError(jsonKey);
  }
}
export function readJson(source: string, limit: number, errors: JsonErrors = GENERIC_JSON) {
  assertSize(utf8Length(source), limit, errors.sizeKey);
  return parseJson(source, errors.jsonKey);
}

// Importers check while they walk, so a hostile file stops before it is fully built.
export function assertNodeCount(count: number): void {
  if (count > MAX_NODE_COUNT)
    throw new AppError('file.mapMustHaveMostNodes', { max: formatCount(MAX_NODE_COUNT) });
}
export function assertDepth(depth: number): void {
  if (depth > MAX_DEPTH) throw depthLimit();
}

/** Only openable links enter the model; imported files are untrusted. */
export const safeLinks = (links: readonly string[]): string[] => links.filter(safeUrl);
