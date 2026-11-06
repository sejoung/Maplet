import {
  MAX_TITLE,
  type Connection,
  type Json,
  type JsonObject,
  type MindMap,
  type MindNode,
} from '../../domain/model';
import { isNodePosition } from '../../domain/positions';
import { AppError } from '../../domain/errors';
import { isNodeId, own } from '../../domain/ids';
import { isOneOf } from '../../domain/guards';
import { isJsonObject } from '../../domain/json';
import { hasDuplicateRanks, isValidRank, renumberRanks } from '../../domain/ranks';
import { cleanConnections } from '../../domain/connections';
import {
  assertDepth,
  assertNodeCount,
  MAX_MAPLET_BYTES,
  readJson,
  safeLinks,
  UNSAFE_LINK_WARNING,
  type JsonErrors,
} from '../limits';

export const MAPLET_JSON: JsonErrors = {
  sizeKey: 'file.mapletFilesMustMibSmaller',
  jsonKey: 'file.invalidJson',
};
const nodeFields = [
  'id',
  'title',
  'parentId',
  'children',
  'rank',
  'side',
  'collapsed',
  'position',
  'style',
  'notes',
  'links',
];
const documentFields = ['format', 'version', 'roots', 'nodes', 'connections'];
const FORMAT_VERSIONS = [1, 2, 3] as const;
const SIDES = ['left', 'right'] as const;

const objectOr = (value: unknown): JsonObject => (isJsonObject(value) ? value : {});
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every(isNodeId);
/** An optional field is absent or passes its guard. */
const optional = (value: unknown, guard: (value: unknown) => boolean) =>
  value === undefined || guard(value);
const extensions = (raw: JsonObject, known: string[]): JsonObject =>
  Object.fromEntries(Object.entries(raw).filter(([key]) => !known.includes(key)));

/** Every structural defect gets one message; the file is rejected rather than half-loaded. */
function check(condition: boolean): asserts condition {
  if (!condition) throw new AppError('file.mapletDocumentHasInvalidNodes');
}

/** Children order is authoritative; colliding ranks (older releases could create them) are repaired. */
function validateTree(map: MindMap) {
  const visited = new Set<string>();
  const visit = (id: string, parent: string | null, depth: number) => {
    assertDepth(depth);
    check(Object.hasOwn(map.nodes, id) && !visited.has(id));
    const node = map.nodes[id];
    check(node.parentId === parent);
    visited.add(id);
    node.children.forEach((child) => visit(child, id, depth + 1));
  };
  map.roots.forEach((id) => visit(id, null, 1));
  check(visited.size === Object.keys(map.nodes).length);
  for (const ids of [map.roots, ...Object.values(map.nodes).map((node) => node.children)])
    if (hasDuplicateRanks(map, ids))
      // The parser owns this freshly built map, so repairing it in place is safe.
      for (const [id, rank] of Object.entries(renumberRanks(map, ids))) map.nodes[id].rank = rank;
}

export function parseMaplet(source: string): MindMap {
  return mapletFromJson(readJson(source, MAX_MAPLET_BYTES, MAPLET_JSON));
}

/** Whether `source` is a valid Maplet document, e.g. stored content to trust again. */
export function isMapletSource(source: string): boolean {
  try {
    parseMaplet(source);
    return true;
  } catch {
    return false;
  }
}

/** MindMup data a converted document keeps for a lossless `.mup` export. */
function readCompatibility(value: unknown, rootCount: number) {
  check(optional(value, isJsonObject));
  const mindmup = objectOr(value).mindmup;
  check(optional(mindmup, isJsonObject));
  const legacy = objectOr(mindmup);
  const formatVersion = legacy.formatVersion ?? (rootCount > 1 ? 3 : 2);
  // Only version 3 has several roots.
  check(isOneOf(FORMAT_VERSIONS, formatVersion) && (rootCount === 1 || formatVersion === 3));
  check(optional(legacy.original, (original) => original === null || typeof original === 'string'));
  check(optional(legacy.document, isJsonObject));
  check(optional(legacy.nodes, isJsonObject));
  check(optional(legacy.warnings, isStrings));
  return {
    formatVersion,
    original: typeof legacy.original === 'string' ? legacy.original : null,
    document: objectOr(legacy.document),
    warnings: isStrings(legacy.warnings) ? [...legacy.warnings] : [],
    nodes: objectOr(legacy.nodes),
  };
}

/** A node's MindMup identity and raw fields; a kept original ID must name the same node. */
function readNodeMetadata(id: string, saved: Json | undefined) {
  check(optional(saved, isJsonObject));
  const meta = objectOr(saved);
  const { originalId } = meta;
  check(
    originalId === undefined ||
      ((typeof originalId === 'string' || typeof originalId === 'number') &&
        String(originalId) === id),
  );
  check(optional(meta.raw, isJsonObject));
  return { originalId: originalId ?? id, raw: objectOr(meta.raw) };
}

function readNode(id: string, value: unknown, metadata: JsonObject) {
  check(isNodeId(id) && isJsonObject(value) && value.id === id);
  check(typeof value.title === 'string' && value.title.length <= MAX_TITLE);
  check(isIds(value.children) && new Set(value.children).size === value.children.length);
  check(value.parentId === null || isNodeId(value.parentId));
  check(isOneOf(SIDES, value.side) && isValidRank(value.rank));
  check(typeof value.collapsed === 'boolean' && isJsonObject(value.style));
  check(typeof value.notes === 'string' && isStrings(value.links));
  check(value.position === null || isNodePosition(value.position));
  const meta = readNodeMetadata(id, own(metadata, id));
  const links = safeLinks(value.links);
  const node: MindNode = {
    id,
    originalId: meta.originalId,
    title: value.title,
    parentId: value.parentId,
    children: [...value.children],
    rank: value.rank,
    side: value.side,
    collapsed: value.collapsed,
    style: { ...value.style },
    notes: value.notes,
    links,
    position: value.position ? { x: value.position.x, y: value.position.y } : null,
    rawExtensions: meta.raw,
    nativeExtensions: extensions(value, nodeFields),
  };
  return { node, unsafeLinks: links.length !== value.links.length };
}

/** Links to missing nodes or repeats are dropped rather than rejecting the document. */
function readConnections(value: unknown, map: MindMap): Connection[] {
  check(
    Array.isArray(value) &&
      value.every(
        (link) =>
          isJsonObject(link) && isNodeId(link.from) && isNodeId(link.to) && link.from !== link.to,
      ),
  );
  return cleanConnections(
    map,
    (value as JsonObject[]).map((link) => ({ from: link.from as string, to: link.to as string })),
  );
}

/** Validate an already parsed document; callers own the size check. */
export function mapletFromJson(raw: unknown): MindMap {
  if (!isJsonObject(raw) || raw.format !== 'maplet') throw new AppError('file.notMapletDocument');
  if (raw.version !== 1) throw new AppError('file.unsupportedMapletFileVersion');
  check(isIds(raw.roots) && raw.roots.length > 0 && isJsonObject(raw.nodes));
  const entries = Object.entries(raw.nodes);
  assertNodeCount(entries.length);
  const legacy = readCompatibility(raw.compatibility, raw.roots.length);
  const nodes: Record<string, MindNode> = {};
  let unsafeLinks = false;
  for (const [id, value] of entries) {
    const read = readNode(id, value, legacy.nodes);
    nodes[id] = read.node;
    unsafeLinks ||= read.unsafeLinks;
  }
  const map: MindMap = {
    roots: [...raw.roots],
    nodes,
    formatVersion: legacy.formatVersion,
    original: legacy.original,
    rawExtensions: legacy.document,
    warnings: legacy.warnings,
    nativeExtensions: extensions(raw, documentFields),
  };
  if (unsafeLinks && !map.warnings.includes(UNSAFE_LINK_WARNING))
    map.warnings.push(UNSAFE_LINK_WARNING);
  validateTree(map);
  if (raw.connections !== undefined) map.connections = readConnections(raw.connections, map);
  return map;
}

export function serializeMaplet(map: MindMap): string {
  const previous = objectOr(objectOr(map.nativeExtensions).compatibility);
  const raw: JsonObject = {
    ...extensions(objectOr(map.nativeExtensions), ['compatibility']),
    format: 'maplet',
    version: 1,
    roots: [...map.roots],
    nodes: Object.fromEntries(
      Object.values(map.nodes).map((node) => [
        node.id,
        {
          ...node.nativeExtensions,
          id: node.id,
          title: node.title,
          parentId: node.parentId,
          children: [...node.children],
          rank: node.rank,
          side: node.side,
          collapsed: node.collapsed,
          position: node.position ? { ...node.position } : null,
          style: { ...node.style },
          notes: node.notes,
          links: [...node.links],
        },
      ]),
    ),
  };
  if (map.connections?.length)
    raw.connections = map.connections.map(({ from, to }) => ({ from, to }));
  if (map.nativeExtensions?.compatibility !== undefined) raw.compatibility = previous;
  const legacy = objectOr(previous.mindmup);
  const preserveLegacy =
    map.original !== null ||
    Object.keys(map.rawExtensions).length ||
    map.formatVersion !== (map.roots.length > 1 ? 3 : 2) ||
    Object.values(map.nodes).some(
      (node) => Object.keys(node.rawExtensions).length || node.originalId !== node.id,
    );
  if (preserveLegacy || previous.mindmup !== undefined) {
    raw.compatibility = {
      ...previous,
      mindmup: {
        ...legacy,
        formatVersion: map.formatVersion,
        original: map.original,
        document: map.rawExtensions,
        warnings: [...map.warnings],
        nodes: Object.fromEntries(
          Object.values(map.nodes).map((node) => [
            node.id,
            {
              ...objectOr(objectOr(legacy.nodes)[node.id]),
              originalId: node.originalId,
              raw: node.rawExtensions,
            },
          ]),
        ),
      },
    };
  }
  return JSON.stringify(raw, null, 2) + '\n';
}
