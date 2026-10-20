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
export const equalValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equalValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
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
): unknown {
  if (equalValue(local, remote) || equalValue(base, remote)) return local;
  if (equalValue(base, local)) return remote;
  // Coordinates form one position; x/y must never come from different drags.
  if (
    path.at(-1) !== 'position' &&
    record(local) &&
    record(remote) &&
    (base === undefined || record(base))
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
          ),
        ])
        .filter(([, value]) => value !== undefined),
    );
  }
  const id = JSON.stringify([nodeId, path]);
  const choice = choices[id];
  if (!choice) conflicts.push({ id, nodeId, path, base, local, remote });
  return choice === 'remote' ? remote : local;
}
