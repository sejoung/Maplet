import { equalJson, isJsonObject } from '../util/json';
import { own } from '../util/ids';

export type MergeChoice = 'local' | 'remote';
export interface MergeConflict {
  id: string;
  nodeId: string | null;
  path: string[];
  base: unknown;
  local: unknown;
  remote: unknown;
}
export type MergeChoices = Record<string, MergeChoice>;
/**
 * Explicit choices win; `prefer` resolves every other conflict in the same pass. `conflicts`
 * collects what one merge reports, so a merge owns its resolution.
 */
export interface MergeResolution {
  conflicts: MergeConflict[];
  choices: MergeChoices;
  prefer?: MergeChoice;
}
/** The three versions of one value. */
export interface MergeSides {
  base: unknown;
  local: unknown;
  remote: unknown;
}
/** Where a value lives: a node (or the document, `null`) and the path inside it. */
export interface MergePlace {
  nodeId: string | null;
  path: string[];
}
export const equalValue = equalJson;

/** The ID a choice is stored under, stable across merges of the same documents. */
export const conflictId = (nodeId: string | null, path: readonly string[]) =>
  JSON.stringify([nodeId, path]);

/** Record the conflict when undecided, and return which side to take. */
export function decide(
  resolution: MergeResolution,
  conflict: () => MergeConflict,
  id: string,
): MergeChoice {
  const choice = resolution.choices[id];
  if (!choice) resolution.conflicts.push(conflict());
  return choice ?? resolution.prefer ?? 'local';
}

/** Three-way merge of one JSON value; objects merge per property, other values as a whole. */
export function mergeValue(
  { base, local, remote }: MergeSides,
  { nodeId, path }: MergePlace,
  resolution: MergeResolution,
): unknown {
  if (equalJson(local, remote) || equalJson(base, remote)) return local;
  if (equalJson(base, local)) return remote;
  // Coordinates form one position; x/y must never come from different drags.
  if (
    path.at(-1) !== 'position' &&
    isJsonObject(local) &&
    isJsonObject(remote) &&
    (base === undefined || isJsonObject(base))
  ) {
    return Object.fromEntries(
      [...new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(remote)])]
        .map((key) => [
          key,
          mergeValue(
            { base: base && own(base, key), local: own(local, key), remote: own(remote, key) },
            { nodeId, path: [...path, key] },
            resolution,
          ),
        ])
        .filter(([, value]) => value !== undefined),
    );
  }
  const id = conflictId(nodeId, path);
  const side = decide(resolution, () => ({ id, nodeId, path, base, local, remote }), id);
  return side === 'remote' ? remote : local;
}
