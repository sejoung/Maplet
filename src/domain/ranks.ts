import type { MindMap, Side } from './model';

export const signedRank = (magnitude: number, side: Side) =>
  String(side === 'left' ? -magnitude : magnitude);
export const rankMagnitude = (rank: string) => Math.abs(Number(rank));

export function nextRank(map: MindMap, siblings: string[], side: Side): string {
  const max = Math.max(
    0,
    ...siblings
      .filter((id) => map.nodes[id].side === side)
      .map((id) => rankMagnitude(map.nodes[id].rank)),
  );
  return signedRank(max + 1, side);
}

/** Give `ids` distinct ranks in their current order. Mutates `map`. */
export function renumberRanks(map: MindMap, ids: string[]): void {
  ids.forEach((id, index) => {
    map.nodes[id].rank = signedRank(index + 1, map.nodes[id].side);
  });
}

export const hasDuplicateRanks = (map: MindMap, ids: string[]) =>
  new Set(ids.map((id) => map.nodes[id].rank)).size !== ids.length;

/**
 * Rank `id`, already spliced into `siblings`, between its same-side neighbours.
 * Existing ranks stay untouched unless floating point leaves no distinct midpoint.
 * Mutates `map`.
 */
export function placeRank(map: MindMap, siblings: string[], id: string): void {
  const side = map.nodes[id].side;
  const sameSide = siblings.filter((key) => map.nodes[key].side === side);
  const index = sameSide.indexOf(id);
  const previous = sameSide[index - 1];
  const next = sameSide[index + 1];
  const low = previous ? rankMagnitude(map.nodes[previous].rank) : 0;
  if (!next) {
    map.nodes[id].rank = signedRank(low + 1, side);
    return;
  }
  const high = rankMagnitude(map.nodes[next].rank);
  const middle = (low + high) / 2;
  if (low < middle && middle < high) map.nodes[id].rank = signedRank(middle, side);
  else renumberRanks(map, sameSide);
}
