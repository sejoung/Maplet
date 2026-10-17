import type { MindMap } from '../domain/model';

export interface History {
  past: MindMap[];
  present: MindMap;
  future: MindMap[];
}
export const createHistory = (present: MindMap): History => ({ past: [], present, future: [] });
export function commit(history: History, present: MindMap): History {
  if (history.present === present) return history;
  return { past: [...history.past, history.present].slice(-100), present, future: [] };
}
export function undo(history: History): History {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}
export function redo(history: History): History {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
