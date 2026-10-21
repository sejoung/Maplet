import {
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type MindMap,
  type MindNode,
  type Side,
} from './model';
import { AppError, formatCount } from './errors';
import { isReservedId } from './ids';
import { equalJson } from './json';
import { nextRank, placeRank } from './ranks';

function nodeOf(map: MindMap, id: string): MindNode {
  if (!Object.hasOwn(map.nodes, id)) throw new AppError('노드를 찾을 수 없습니다.');
  return map.nodes[id];
}

function titleOf(title: string): string {
  if (!title.trim() || title.length > MAX_TITLE)
    throw new AppError('제목은 1~{max}자로 입력해 주세요.', { max: formatCount(MAX_TITLE) });
  return title;
}

export function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function createNode(
  id: string,
  title: string,
  parentId: string | null,
  side: Side,
  rank: string,
): MindNode {
  return {
    id,
    originalId: id,
    title: titleOf(title),
    children: [],
    parentId,
    rank,
    side,
    collapsed: false,
    style: {},
    notes: '',
    links: [],
    position: null,
    rawExtensions: {},
  };
}

export function createMap(title = '중심 주제'): MindMap {
  return {
    formatVersion: 2,
    roots: ['root'],
    nodes: { root: createNode('root', title, null, 'right', '1') },
    rawExtensions: {},
    original: null,
    warnings: [],
  };
}

export function depthOf(map: MindMap, id: string): number {
  let depth = 0;
  let current: string | null = id;
  while (current !== null) {
    current = map.nodes[current].parentId;
    depth++;
  }
  return depth;
}

export const depthLimit = () => new AppError('최대 노드 깊이는 {max}입니다.', { max: MAX_DEPTH });

/**
 * Splice a node that already exists in `result` (a clone of `map`) under `parentId`, after
 * `afterId` or last, and rank it among its new siblings.
 */
export function attachChild(
  result: MindMap,
  map: MindMap,
  parentId: string,
  id: string,
  afterId?: string,
) {
  const siblings = result.nodes[parentId].children;
  result.nodes[id].rank = nextRank(map, map.nodes[parentId].children, result.nodes[id].side);
  siblings.splice(afterId ? siblings.indexOf(afterId) + 1 : siblings.length, 0, id);
  if (afterId) placeRank(result, siblings, id);
  result.nodes[parentId].collapsed = false;
}

export function addNode(
  map: MindMap,
  parentId: string,
  id: string,
  title = '새 노드',
  afterId?: string,
): MindMap {
  const parent = nodeOf(map, parentId);
  if (afterId && nodeOf(map, afterId).parentId !== parentId)
    throw new AppError('같은 부모 아래의 형제 노드를 선택해 주세요.');
  if (Object.hasOwn(map.nodes, id) || isReservedId(id))
    throw new AppError('중복되거나 사용할 수 없는 노드 ID입니다.');
  if (Object.keys(map.nodes).length >= MAX_NODE_COUNT) throw nodeLimit();
  if (depthOf(map, parentId) >= MAX_DEPTH) throw depthLimit();
  const result = structuredClone(map);
  const side = afterId ? nodeOf(map, afterId).side : parent.side;
  result.nodes[id] = createNode(id, title, parentId, side, '1');
  attachChild(result, map, parentId, id, afterId);
  return result;
}

export function renameNode(map: MindMap, id: string, title: string): MindMap {
  const node = nodeOf(map, id);
  titleOf(title);
  if (node.title === title) return map;
  return { ...map, nodes: { ...map.nodes, [id]: { ...node, title } } };
}

export function isDescendant(map: MindMap, ancestor: string, candidate: string): boolean {
  let id = nodeOf(map, candidate).parentId;
  while (id !== null) {
    if (id === ancestor) return true;
    id = map.nodes[id].parentId;
  }
  return false;
}

export function deleteNode(map: MindMap, id: string): MindMap {
  const node = nodeOf(map, id);
  if (node.parentId === null && map.roots.length === 1)
    throw new AppError('마지막 중심 노드는 삭제할 수 없습니다.');
  const result = structuredClone(map);
  if (node.parentId === null) result.roots = result.roots.filter((key) => key !== id);
  else
    result.nodes[node.parentId].children = result.nodes[node.parentId].children.filter(
      (key) => key !== id,
    );
  const remove = (key: string) => {
    result.nodes[key].children.forEach(remove);
    delete result.nodes[key];
  };
  remove(id);
  return result;
}

function setSide(map: MindMap, id: string, side: Side) {
  map.nodes[id].side = side;
  map.nodes[id].position = null;
  map.nodes[id].children.forEach((child) => setSide(map, child, side));
}

function subtreeHeight(map: MindMap, id: string): number {
  return 1 + Math.max(0, ...map.nodes[id].children.map((child) => subtreeHeight(map, child)));
}

export function moveNode(map: MindMap, id: string, parentId: string): MindMap {
  const node = nodeOf(map, id);
  const parent = nodeOf(map, parentId);
  if (id === parentId || isDescendant(map, id, parentId))
    throw new AppError('순환 참조가 생기는 이동은 할 수 없습니다.');
  if (node.parentId === null)
    throw new AppError('중심 노드는 다른 노드 아래로 이동할 수 없습니다.');
  if (node.parentId === parentId) return map;
  if (depthOf(map, parentId) + subtreeHeight(map, id) > MAX_DEPTH) throw depthLimit();
  const result = structuredClone(map);
  result.nodes[node.parentId].children = result.nodes[node.parentId].children.filter(
    (key) => key !== id,
  );
  result.nodes[parentId].children.push(id);
  result.nodes[parentId].collapsed = false;
  result.nodes[id].parentId = parentId;
  result.nodes[id].rank = nextRank(map, parent.children, parent.side);
  setSide(result, id, parent.side);
  return result;
}

export function updateNode(
  map: MindMap,
  id: string,
  patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'collapsed' | 'side'>>,
): MindMap {
  const node = nodeOf(map, id);
  if (patch.links?.some((link) => !safeUrl(link)))
    throw new AppError('링크는 http, https 또는 mailto 주소만 사용할 수 있습니다.');
  if (Object.entries(patch).every(([key, value]) => equalJson(node[key as keyof MindNode], value)))
    return map;
  if (patch.side && patch.side !== node.side && node.parentId === null)
    throw new AppError('중심 노드는 방향을 바꿀 수 없습니다.');
  const result = structuredClone(map);
  Object.assign(result.nodes[id], patch);
  if (patch.side && patch.side !== node.side) {
    let branch = id;
    while (result.nodes[result.nodes[branch].parentId!].parentId !== null)
      branch = result.nodes[branch].parentId!;
    const parentId = result.nodes[branch].parentId!;
    result.nodes[branch].rank = nextRank(
      map,
      map.nodes[parentId].children.filter((key) => key !== branch),
      patch.side,
    );
    setSide(result, branch, patch.side);
  }
  return result;
}

export const nodeLimit = () =>
  new AppError('최대 {max}개 노드까지 편집할 수 있습니다.', { max: formatCount(MAX_NODE_COUNT) });

/** Swap a node with its previous (-1) or next (1) sibling on the same side. */
export function moveSibling(map: MindMap, id: string, offset: -1 | 1): MindMap {
  const node = nodeOf(map, id);
  if (node.parentId === null) return map;
  const siblings = map.nodes[node.parentId].children;
  const sameSide = siblings.filter((key) => map.nodes[key].side === node.side);
  const neighbor = sameSide[sameSide.indexOf(id) + offset];
  if (!neighbor) return map;
  const result = structuredClone(map);
  const children = result.nodes[node.parentId].children;
  const [a, b] = [children.indexOf(id), children.indexOf(neighbor)];
  [children[a], children[b]] = [children[b], children[a]];
  const rank = result.nodes[id].rank;
  result.nodes[id].rank = result.nodes[neighbor].rank;
  result.nodes[neighbor].rank = rank;
  // Manually placed branches would otherwise keep their old spots and hide the new order.
  const release = (key: string) => {
    result.nodes[key].position = null;
    result.nodes[key].children.forEach(release);
  };
  release(id);
  release(neighbor);
  return result;
}
