import type { MindMap } from '../domain/model';
import { stripMapExtension } from '../domain/filename';
import { isJsonObject } from '../domain/util/json';
import { MAPLET_JSON, mapletFromJson, serializeMaplet } from './maplet/codec';
import { MUP_JSON, mupFromJson, serializeMup } from './mup/codec';
import { mapToMarkdown, mapToOpml, markdownToMap, opmlToMap, textToMap } from './outline/outline';
import {
  assertSize,
  GENERIC_JSON,
  MAX_MAPLET_BYTES,
  MAX_MUP_BYTES,
  parseJson,
  utf8Length,
  type JsonErrors,
} from './limits';

export const MAPLET_MIME = 'application/x-maplet+json';
/** Manually uploaded .maplet files may arrive as generic binary files. */
export const DRIVE_MAPLET_MIME_TYPES = [MAPLET_MIME, 'application/octet-stream'] as const;

/** Everything the app knows about a file format, chosen by the file's extension. */
export interface MapFormat {
  id: 'maplet' | 'mup' | 'json' | 'markdown' | 'opml' | 'text';
  /** Lower case without the dot; the first one names exported files. */
  extensions: readonly string[];
  maxBytes: number;
  mime: string;
  /** `name` is the file's name; outlines title a root added for several top items with it. */
  parse(source: string, name: string): MindMap;
  serialize?(map: MindMap, title: string): string;
  /** Outlines arrive without a layout; the app (which owns layout) arranges them. */
  needsLayout?: boolean;
}

/**
 * Detect Maplet or MindMup JSON from one parse; each keeps its own size limit. `errors`
 * word the failures for the format the name promised (generic when nothing is known).
 */
export function parseDocument(source: string, errors: JsonErrors = GENERIC_JSON): MindMap {
  const bytes = utf8Length(source);
  assertSize(bytes, MAX_MAPLET_BYTES, errors.sizeKey);
  const raw = parseJson(source, errors.jsonKey);
  if (isJsonObject(raw) && raw.format === 'maplet') return mapletFromJson(raw);
  assertSize(bytes, MAX_MUP_BYTES, MUP_JSON.sizeKey);
  return mupFromJson(raw, source);
}

const outline =
  (read: (text: string, title: string) => MindMap) => (source: string, name: string) => {
    assertSize(utf8Length(source), MAX_MUP_BYTES);
    return read(source, stripMapExtension(name));
  };
const NATIVE: MapFormat = {
  id: 'maplet',
  extensions: ['maplet'],
  maxBytes: MAX_MAPLET_BYTES,
  mime: MAPLET_MIME,
  // Content decides, so a renamed MindMup file still opens.
  parse: (source) => parseDocument(source, MAPLET_JSON),
  serialize: serializeMaplet,
};
/** `.json` and unknown names: content decides, within the native size budget. */
const JSON_DOCUMENT: MapFormat = {
  id: 'json',
  extensions: ['json'],
  maxBytes: MAX_MAPLET_BYTES,
  mime: 'application/json',
  parse: (source) => parseDocument(source),
};
export const FORMATS: readonly MapFormat[] = [
  NATIVE,
  {
    id: 'mup',
    extensions: ['mup'],
    maxBytes: MAX_MUP_BYTES,
    mime: 'application/json',
    parse: (source) => parseDocument(source, MUP_JSON),
    serialize: serializeMup,
  },
  JSON_DOCUMENT,
  {
    id: 'markdown',
    extensions: ['md', 'markdown'],
    maxBytes: MAX_MUP_BYTES,
    mime: 'text/markdown',
    parse: outline(markdownToMap),
    serialize: mapToMarkdown,
    needsLayout: true,
  },
  {
    id: 'opml',
    extensions: ['opml'],
    maxBytes: MAX_MUP_BYTES,
    mime: 'text/x-opml',
    parse: outline(opmlToMap),
    serialize: mapToOpml,
    needsLayout: true,
  },
  {
    id: 'text',
    extensions: ['txt'],
    maxBytes: MAX_MUP_BYTES,
    mime: 'text/plain',
    parse: outline(textToMap),
    needsLayout: true,
  },
];

const extensionOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1] ?? '';
const byExtension = (extension: string) =>
  FORMATS.find((format) => format.extensions.includes(extension.toLowerCase()));
export const formatOf = (name: string): MapFormat =>
  byExtension(extensionOf(name)) ?? JSON_DOCUMENT;

/** Open a chosen file; `needsLayout` asks the caller to arrange the map before showing it. */
export function openMapFile(source: string, name: string) {
  const format = formatOf(name);
  return { map: format.parse(source, name), needsLayout: Boolean(format.needsLayout) };
}

export interface FileDownload {
  content: string;
  name: string;
  type: string;
}
const textType = (format: MapFormat) => `${format.mime};charset=utf-8`;

/** `map` written in the format of `extension` (such as `md`), named after `title`. */
export function exportMap(map: MindMap, extension: string, title: string): FileDownload {
  const format = byExtension(extension);
  // Callers name a writable format; this is a programming error, not a user-facing one.
  if (!format?.serialize) throw new Error(`No writer for .${extension}`);
  return {
    content: format.serialize(map, title),
    name: `${title}.${extension}`,
    type: textType(format),
  };
}

/** A map document keeps a Maplet or MindMup name; any other name is saved as native. */
export function documentDownload(content: string, name: string): FileDownload {
  const format = formatOf(name);
  const keep = format.id === 'maplet' || format.id === 'mup';
  return {
    content,
    name: keep ? name : `${name}.${NATIVE.extensions[0]}`,
    type: textType(keep ? format : NATIVE),
  };
}

export const isNativeName = (name: string) => formatOf(name) === NATIVE;
/** MIME alone also admits unrelated binary files; require the native extension too. */
export const isDriveMaplet = (file: { name: string; mimeType?: string }) =>
  isNativeName(file.name) && DRIVE_MAPLET_MIME_TYPES.some((type) => file.mimeType === type);
export const nativeFilename = (name: string) =>
  `${stripMapExtension(name)}.${NATIVE.extensions[0]}`;

/** Drive saves only into a native file in the save folder; any other file is a copy source. */
export const isAutosaveFile = (file: { name: string; parents?: string[] }, folderId: string) =>
  isNativeName(file.name) && Boolean(file.parents?.includes(folderId));

export function driveSaveTarget(
  name: string,
  current: { name: string } | null,
  copy: boolean,
  copyLabel = 'copy',
) {
  return {
    create: copy || !current || !isNativeName(current.name),
    name: copy ? nativeFilename(`${stripMapExtension(name)} (${copyLabel})`) : nativeFilename(name),
  };
}
