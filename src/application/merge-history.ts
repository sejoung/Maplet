import { mergeMaps, equalMaps } from '../domain/merge';
import type { MindMap } from '../domain/model';
import type { History } from './history';

/** Carry remote changes through undo/redo without adding an external edit as an undo step. */
export function mergeHistory(history: History, base: MindMap, incoming: MindMap): History {
  if (equalMaps(base, incoming)) return history;
  const rebase = (map: MindMap, prefer: 'local' | 'remote') => {
    const choices: Record<string, 'local' | 'remote'> = {};
    let attempt = mergeMaps(base, map, incoming);
    for (let pass = 0; attempt.conflicts.length && pass < 3; pass++) {
      attempt.conflicts.forEach((item) => {
        choices[item.id] = prefer;
      });
      attempt = mergeMaps(base, map, incoming, choices);
    }
    return attempt.map;
  };
  return {
    present: rebase(history.present, 'local'),
    past: history.past.map((map) => rebase(map, 'remote')),
    future: history.future.map((map) => rebase(map, 'remote')),
  };
}
