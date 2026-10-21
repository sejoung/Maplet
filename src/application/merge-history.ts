import { changedNodes, mergeMaps, equalMaps, type MergeChoice } from '../domain/merge';
import type { MindMap } from '../domain/model';
import type { History } from './history';

/** Carry remote changes through undo/redo without adding an external edit as an undo step. */
export function mergeHistory(history: History, base: MindMap, incoming: MindMap): History {
  if (equalMaps(base, incoming)) return history;
  // The remote side is identical for every snapshot: diff it once, merge each in one pass.
  const remoteChanges = changedNodes(base, incoming);
  const rebase = (map: MindMap, prefer: MergeChoice) =>
    mergeMaps(base, map, incoming, {}, { prefer, remoteChanges }).map;
  return {
    present: rebase(history.present, 'local'),
    past: history.past.map((map) => rebase(map, 'remote')),
    future: history.future.map((map) => rebase(map, 'remote')),
  };
}
