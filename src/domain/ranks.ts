import type { MindNode, Side } from './model';

/** Ranks live on map and fragment nodes; changes come back as `{ id: rank }` to apply. */
type Ranked = { nodes: Readonly<Record<string, Pick<MindNode, 'rank' | 'side'>>> };

export const signedRank = (magnitude: number, side: Side) =>
  String(side === 'left' ? -magnitude : magnitude);
export const rankMagnitude = (rank: string) => Math.abs(Number(rank));

export function nextRank(map: Ranked, siblings: readonly string[], side: Side): string {
  const max = Math.max(
    0,
    ...siblings
      .filter((id) => map.nodes[id].side === side)
      .map((id) => rankMagnitude(map.nodes[id].rank)),
  );
  return signedRank(max + 1, side);
}

/** Distinct ranks for `ids` in their current order. */
export const renumberRanks = (map: Ranked, ids: readonly string[]): Record<string, string> =>
  Object.fromEntries(ids.map((id, index) => [id, signedRank(index + 1, map.nodes[id].side)]));

export const hasDuplicateRanks = (map: Ranked, ids: readonly string[]) =>
  new Set(ids.map((id) => map.nodes[id].rank)).size !== ids.length;

/**
 * The rank for `id`, already spliced into `siblings`, between its same-side neighbours.
 * Existing ranks stay untouched unless floating point leaves no distinct midpoint, in which
 * case the whole side is renumbered.
 */
export function placeRank(
  map: Ranked,
  siblings: readonly string[],
  id: string,
): Record<string, string> {
  const side = map.nodes[id].side;
  const sameSide = siblings.filter((key) => map.nodes[key].side === side);
  const index = sameSide.indexOf(id);
  const previous = sameSide[index - 1];
  const next = sameSide[index + 1];
  const low = previous ? rankMagnitude(map.nodes[previous].rank) : 0;
  if (!next) return { [id]: signedRank(low + 1, side) };
  const high = rankMagnitude(map.nodes[next].rank);
  const middle = (low + high) / 2;
  return low < middle && middle < high
    ? { [id]: signedRank(middle, side) }
    : renumberRanks(map, sameSide);
}

/** A stored rank: a nonzero finite number whose sign gives the side (files are untrusted). */
export const isValidRank = (rank: unknown): rank is string =>
  typeof rank === 'string' &&
  rank.trim() !== '' &&
  Number.isFinite(Number(rank)) &&
  Number(rank) !== 0;
