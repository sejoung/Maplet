import type { Connection, MindMap } from './model';
import { AppError, formatCount } from './errors';

export const MAX_CONNECTIONS = 1_000;

const same = (a: Connection, b: Connection) => a.from === b.from && a.to === b.to;

/** Valid, distinct connections between existing nodes, in their original order. */
export function cleanConnections(map: MindMap, connections: readonly Connection[]): Connection[] {
  const result: Connection[] = [];
  for (const { from, to } of connections)
    if (
      from !== to &&
      Object.hasOwn(map.nodes, from) &&
      Object.hasOwn(map.nodes, to) &&
      !result.some((other) => same(other, { from, to })) &&
      result.length < MAX_CONNECTIONS
    )
      result.push({ from, to });
  return result;
}

/** Drop connections whose ends were deleted; keeps the map when nothing changes. */
export function pruneConnections(map: MindMap): MindMap {
  if (!map.connections) return map;
  const kept = cleanConnections(map, map.connections);
  return kept.length === map.connections.length ? map : { ...map, connections: kept };
}

export function addConnection(map: MindMap, from: string, to: string): MindMap {
  if (!Object.hasOwn(map.nodes, from) || !Object.hasOwn(map.nodes, to))
    throw new AppError('노드를 찾을 수 없습니다.');
  if (from === to) throw new AppError('같은 노드끼리는 연결할 수 없습니다.');
  const connections = map.connections ?? [];
  if (connections.some((other) => same(other, { from, to }))) return map;
  if (connections.length >= MAX_CONNECTIONS)
    throw new AppError('연결선은 최대 {max}개까지 만들 수 있습니다.', {
      max: formatCount(MAX_CONNECTIONS),
    });
  return { ...map, connections: [...connections, { from, to }] };
}

export function removeConnection(map: MindMap, from: string, to: string): MindMap {
  const connections = map.connections ?? [];
  const kept = connections.filter((other) => !same(other, { from, to }));
  return kept.length === connections.length ? map : { ...map, connections: kept };
}
