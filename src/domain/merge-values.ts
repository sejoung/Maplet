import { equalJson, isJsonObject } from './json';

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
/** Explicit choices win; `prefer` resolves every other conflict in the same pass. */
export interface MergeResolution {
  conflicts: MergeConflict[];
  choices: MergeChoices;
  prefer?: MergeChoice;
}
export const equalValue = equalJson;

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

const own = (value: Record<string, unknown> | undefined, key: string) =>
  value && Object.hasOwn(value, key) ? value[key] : undefined;

export function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  nodeId: string | null,
  path: string[],
  conflicts: MergeConflict[],
  choices: MergeChoices,
  prefer?: MergeChoice,
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
            own(base, key),
            own(local, key),
            own(remote, key),
            nodeId,
            [...path, key],
            conflicts,
            choices,
            prefer,
          ),
        ])
        .filter(([, value]) => value !== undefined),
    );
  }
  const id = JSON.stringify([nodeId, path]);
  const side = decide(
    { conflicts, choices, prefer },
    () => ({ id, nodeId, path, base, local, remote }),
    id,
  );
  return side === 'remote' ? remote : local;
}
