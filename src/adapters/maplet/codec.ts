import {
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type JsonObject,
  type MindMap,
  type MindNode,
} from '../../domain/model';
import { isNodePosition } from '../../domain/positions';

export const MAX_MAPLET_BYTES = 50 * 1024 * 1024;
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
const documentFields = ['format', 'version', 'roots', 'nodes'];

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const obj = (value: unknown): JsonObject => (object(value) ? value : {});
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
const extensions = (raw: JsonObject, known: string[]): JsonObject =>
  Object.fromEntries(Object.entries(raw).filter(([key]) => !known.includes(key)));
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
function invalid(): never {
  throw new Error('Maplet 문서의 노드·계층·속성 형식이 올바르지 않습니다.');
}

function validateTree(map: MindMap) {
  const visited = new Set<string>();
  const visit = (id: string, parent: string | null, depth: number) => {
    if (depth > MAX_DEPTH) throw new Error('최대 노드 깊이는 100입니다.');
    if (!Object.hasOwn(map.nodes, id) || visited.has(id)) invalid();
    const node = map.nodes[id];
    if (node.parentId !== parent) invalid();
    visited.add(id);
    const ranks = node.children.map((child) => map.nodes[child]?.rank);
    if (new Set(ranks).size !== ranks.length) invalid();
    node.children.forEach((child) => visit(child, id, depth + 1));
  };
  map.roots.forEach((id) => visit(id, null, 1));
  if (visited.size !== Object.keys(map.nodes).length) invalid();
  const rootRanks = map.roots.map((id) => map.nodes[id].rank);
  if (new Set(rootRanks).size !== rootRanks.length) invalid();
}

export function parseMaplet(source: string): MindMap {
  if (new TextEncoder().encode(source).byteLength > MAX_MAPLET_BYTES)
    throw new Error('Maplet 파일 크기는 50 MiB 이하여야 합니다.');
  let raw: unknown;
  try {
    raw = JSON.parse(source, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('숫자 범위 초과');
      return value;
    });
  } catch {
    throw new Error('올바른 JSON 파일이 아니거나 숫자 범위를 초과했습니다.');
  }
  if (!object(raw) || raw.format !== 'maplet') throw new Error('Maplet 문서가 아닙니다.');
  if (raw.version !== 1) throw new Error('지원하지 않는 Maplet 파일 버전입니다.');
  if (!strings(raw.roots) || !raw.roots.length || !raw.roots.every(validId) || !object(raw.nodes))
    invalid();
  const entries = Object.entries(raw.nodes);
  if (!entries.length || entries.length > MAX_NODE_COUNT)
    throw new Error('노드는 1~5,000개여야 합니다.');
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
      links: [...node.links],
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
  validateTree(map);
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
