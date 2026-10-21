import {
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type JsonObject,
  type MindMap,
  type MindNode,
} from '../../domain/model';
import { isNodePosition } from '../../domain/positions';
import { safeUrl } from '../../domain/commands';
import { AppError, formatCount } from '../../domain/errors';
import { isNodeId } from '../../domain/ids';
import { isJsonObject, parseFiniteJson } from '../../domain/json';
import { hasDuplicateRanks, renumberRanks } from '../../domain/ranks';
import { cleanConnections } from '../../domain/connections';
import { assertSize, MAX_MAPLET_BYTES, utf8Length } from '../limits';

export { MAX_MAPLET_BYTES } from '../limits';
export const UNSAFE_LINK_WARNING = 'file.unsafeLinksRemoved';
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

const object = isJsonObject;
const obj = (value: unknown): JsonObject => (object(value) ? value : {});
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
const extensions = (raw: JsonObject, known: string[]): JsonObject =>
  Object.fromEntries(Object.entries(raw).filter(([key]) => !known.includes(key)));
const validId = isNodeId;
function invalid(): never {
  throw new AppError('file.mapletDocumentHasInvalidNodes');
}

/** Children order is authoritative; colliding ranks (older releases could create them) are repaired. */
function validateTree(map: MindMap) {
  const visited = new Set<string>();
  const visit = (id: string, parent: string | null, depth: number) => {
    if (depth > MAX_DEPTH) throw new AppError('common.depthLimit', { max: MAX_DEPTH });
    if (!Object.hasOwn(map.nodes, id) || visited.has(id)) invalid();
    const node = map.nodes[id];
    if (node.parentId !== parent) invalid();
    visited.add(id);
    node.children.forEach((child) => visit(child, id, depth + 1));
  };
  map.roots.forEach((id) => visit(id, null, 1));
  if (visited.size !== Object.keys(map.nodes).length) invalid();
  for (const ids of [map.roots, ...Object.values(map.nodes).map((node) => node.children)])
    if (hasDuplicateRanks(map, ids)) renumberRanks(map, ids);
}

export function parseMaplet(source: string): MindMap {
  assertSize(utf8Length(source), MAX_MAPLET_BYTES, 'file.mapletFilesMustMibSmaller');
  let raw: unknown;
  try {
    raw = parseFiniteJson(source);
  } catch {
    throw new AppError('file.invalidJson');
  }
  return mapletFromJson(raw);
}

/** Validate an already parsed document; callers own the size check. */
export function mapletFromJson(raw: unknown): MindMap {
  if (!object(raw) || raw.format !== 'maplet') throw new AppError('file.notMapletDocument');
  if (raw.version !== 1) throw new AppError('file.unsupportedMapletFileVersion');
  if (!strings(raw.roots) || !raw.roots.length || !raw.roots.every(validId) || !object(raw.nodes))
    invalid();
  const entries = Object.entries(raw.nodes);
  if (!entries.length || entries.length > MAX_NODE_COUNT)
    throw new AppError('file.mapMustHaveBetween1', { max: formatCount(MAX_NODE_COUNT) });
  if (raw.compatibility !== undefined && !object(raw.compatibility)) invalid();
  const compatibility = obj(raw.compatibility);
  const legacy = obj(compatibility.mindmup);
  if (compatibility.mindmup !== undefined && !object(compatibility.mindmup)) invalid();
  const version = legacy.formatVersion ?? (raw.roots.length > 1 ? 3 : 2);
  if (version !== 1 && version !== 2 && version !== 3) invalid();
  if (raw.roots.length > 1 && version !== 3) invalid();
  if (
    legacy.original !== undefined &&
    legacy.original !== null &&
    typeof legacy.original !== 'string'
  )
    invalid();
  if (legacy.document !== undefined && !object(legacy.document)) invalid();
  if (legacy.nodes !== undefined && !object(legacy.nodes)) invalid();
  if (legacy.warnings !== undefined && !strings(legacy.warnings)) invalid();
  const metadata = obj(legacy.nodes);
  const nodes: Record<string, MindNode> = {};
  let unsafeLinks = false;
  for (const [id, node] of entries) {
    if (
      !validId(id) ||
      !object(node) ||
      node.id !== id ||
      typeof node.title !== 'string' ||
      node.title.length > MAX_TITLE
    )
      invalid();
    if (
      !strings(node.children) ||
      !node.children.every(validId) ||
      new Set(node.children).size !== node.children.length
    )
      invalid();
    if (node.parentId !== null && !validId(node.parentId)) invalid();
    if (node.side !== 'left' && node.side !== 'right') invalid();
    if (
      typeof node.rank !== 'string' ||
      !node.rank.trim() ||
      !Number.isFinite(Number(node.rank)) ||
      Number(node.rank) === 0
    )
      invalid();
    if (
      typeof node.collapsed !== 'boolean' ||
      !object(node.style) ||
      typeof node.notes !== 'string' ||
      !strings(node.links)
    )
      invalid();
    if (node.position !== null && !isNodePosition(node.position)) invalid();
    const savedMetadata = Object.hasOwn(metadata, id) ? metadata[id] : undefined;
    if (savedMetadata !== undefined && !object(savedMetadata)) invalid();
    const meta = obj(savedMetadata);
    if (
      meta.originalId !== undefined &&
      typeof meta.originalId !== 'string' &&
      typeof meta.originalId !== 'number'
    )
      invalid();
    if (
      meta.originalId !== undefined &&
      (!validId(String(meta.originalId)) || String(meta.originalId) !== id)
    )
      invalid();
    if (meta.raw !== undefined && !object(meta.raw)) invalid();
    // Only openable links enter the model; imported files are untrusted.
    const links = node.links.filter(safeUrl);
    if (links.length !== node.links.length) unsafeLinks = true;
    nodes[id] = {
      id,
      originalId: (meta.originalId as string | number) ?? id,
      title: node.title,
      parentId: node.parentId,
      children: [...node.children],
      rank: node.rank,
      side: node.side,
      collapsed: node.collapsed,
      style: { ...node.style },
      notes: node.notes,
      links,
      position: node.position ? { x: node.position.x, y: node.position.y } : null,
      rawExtensions: obj(meta.raw),
      nativeExtensions: extensions(node, nodeFields),
    };
  }
  const map: MindMap = {
    roots: [...raw.roots],
    nodes,
    formatVersion: version,
    original: typeof legacy.original === 'string' ? legacy.original : null,
    rawExtensions: obj(legacy.document),
    warnings: strings(legacy.warnings) ? [...legacy.warnings] : [],
    nativeExtensions: extensions(raw, documentFields),
  };
  if (unsafeLinks && !map.warnings.includes(UNSAFE_LINK_WARNING))
    map.warnings.push(UNSAFE_LINK_WARNING);
  validateTree(map);
  if (raw.connections !== undefined) {
    if (
      !Array.isArray(raw.connections) ||
      !raw.connections.every(
        (link) => object(link) && validId(link.from) && validId(link.to) && link.from !== link.to,
      )
    )
      invalid();
    // Links to missing nodes or repeats are dropped rather than rejecting the document.
    map.connections = cleanConnections(
      map,
      (raw.connections as JsonObject[]).map((link) => ({
        from: link.from as string,
        to: link.to as string,
      })),
    );
  }
  return map;
}

export function serializeMaplet(map: MindMap): string {
  const previous = obj(obj(map.nativeExtensions).compatibility);
  const raw: JsonObject = {
    ...extensions(obj(map.nativeExtensions), ['compatibility']),
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
  const legacy = obj(previous.mindmup);
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
              ...obj(obj(legacy.nodes)[node.id]),
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
