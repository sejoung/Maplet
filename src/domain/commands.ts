import { MAX_DEPTH, MAX_NODE_COUNT, MAX_TITLE, type MindMap, type MindNode } from './model';

function nodeOf(map: MindMap, id: string): MindNode {
  if (!Object.hasOwn(map.nodes, id)) throw new Error('노드를 찾을 수 없습니다.');
  return map.nodes[id];
}

function titleOf(title: string): string {
  if (!title.trim() || title.length > MAX_TITLE)
    throw new Error('제목은 1~10,000자로 입력해 주세요.');
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

export function createMap(title = '중심 주제'): MindMap {
  return {
    formatVersion: 2,
    roots: ['root'],
    nodes: {
      root: {
        id: 'root',
        originalId: 'root',
        title: titleOf(title),
        children: [],
        parentId: null,
        rank: '1',
        side: 'right',
        collapsed: false,
        style: {},
        notes: '',
        links: [],
        position: null,
        rawExtensions: {},
      },
    },
    rawExtensions: {},
    original: null,
    warnings: [],
  };
}

function nextRank(map: MindMap, siblings: string[], side: 'left' | 'right'): string {
  const max = Math.max(
    0,
    ...siblings
      .filter((id) => map.nodes[id].side === side)
      .map((id) => Math.abs(Number(map.nodes[id].rank))),
  );
  return String((max + 1) * (side === 'left' ? -1 : 1));
}

function depthOf(map: MindMap, id: string): number {
  let depth = 0;
  let current: string | null = id;
  while (current !== null) {
    current = map.nodes[current].parentId;
    depth++;
  }
  return depth;
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
    throw new Error('같은 부모 아래의 형제 노드를 선택해 주세요.');
  if (Object.hasOwn(map.nodes, id) || ['__proto__', 'constructor', 'prototype'].includes(id))
    throw new Error('중복되거나 사용할 수 없는 노드 ID입니다.');
  if (Object.keys(map.nodes).length >= MAX_NODE_COUNT)
    throw new Error('최대 5,000개 노드까지 편집할 수 있습니다.');
  if (depthOf(map, parentId) >= MAX_DEPTH) throw new Error('최대 노드 깊이는 100입니다.');
  const result = structuredClone(map);
  const side = afterId ? nodeOf(map, afterId).side : parent.side;
  const siblings = result.nodes[parentId].children;
  result.nodes[id] = {
    id,
    originalId: id,
    title: titleOf(title),
    children: [],
    parentId,
    rank: nextRank(map, siblings, side),
    side,
    collapsed: false,
    style: {},
    notes: '',
    links: [],
    position: null,
    rawExtensions: {},
  };
  const index = afterId ? siblings.indexOf(afterId) + 1 : siblings.length;
  siblings.splice(index, 0, id);
  // New siblings get a fractional rank between neighbors; existing ranks remain untouched.
  if (afterId) {
    const sameSide = siblings.filter((key) => result.nodes[key].side === side);
    const pos = sameSide.indexOf(id);
    const before = Math.abs(Number(result.nodes[afterId].rank));
    const next = sameSide[pos + 1];
    const rank = next ? (before + Math.abs(Number(result.nodes[next].rank))) / 2 : before + 1;
    result.nodes[id].rank = String(rank * (side === 'left' ? -1 : 1));
  }
  result.nodes[parentId].collapsed = false;
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
    throw new Error('마지막 중심 노드는 삭제할 수 없습니다.');
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

function setSide(map: MindMap, id: string, side: 'left' | 'right') {
  map.nodes[id].side = side;
  map.nodes[id].position = null;
  map.nodes[id].children.forEach((child) => setSide(map, child, side));
}

export function moveNode(map: MindMap, id: string, parentId: string): MindMap {
  const node = nodeOf(map, id);
  const parent = nodeOf(map, parentId);
  if (id === parentId || isDescendant(map, id, parentId))
    throw new Error('순환 참조가 생기는 이동은 할 수 없습니다.');
  if (node.parentId === null) throw new Error('중심 노드는 다른 노드 아래로 이동할 수 없습니다.');
  if (node.parentId === parentId) return map;
  let subtreeDepth = 1;
  for (const candidate of Object.values(map.nodes))
    if (isDescendant(map, id, candidate.id))
      subtreeDepth = Math.max(subtreeDepth, depthOf(map, candidate.id) - depthOf(map, id) + 1);
  if (depthOf(map, parentId) + subtreeDepth > MAX_DEPTH)
    throw new Error('최대 노드 깊이는 100입니다.');
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
    throw new Error('링크는 http, https 또는 mailto 주소만 사용할 수 있습니다.');
  if (
    Object.entries(patch).every(
      ([key, value]) => JSON.stringify(node[key as keyof MindNode]) === JSON.stringify(value),
    )
  )
    return map;
  const result = structuredClone(map);
  Object.assign(result.nodes[id], patch);
  if (patch.side && patch.side !== node.side) {
    let branch = id;
    while (
      result.nodes[branch].parentId &&
      result.nodes[result.nodes[branch].parentId!].parentId !== null
    )
      branch = result.nodes[branch].parentId!;
    const parentId = result.nodes[branch].parentId;
    if (parentId)
      result.nodes[branch].rank = nextRank(
        map,
        map.nodes[parentId].children.filter((key) => key !== branch),
        patch.side,
      );
    setSide(result, branch, patch.side);
  }
  return result;
}
