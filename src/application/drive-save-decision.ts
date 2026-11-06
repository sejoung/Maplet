/**
 * When Drive saving may run. The editor asks at three moments (after each render, on a save
 * request, when the buffer timer fires); all share the two rules below.
 */
export type SaveMode = 'normal' | 'copy' | 'overwrite';

export interface SaveState {
  hasFolder: boolean;
  /** A remembered workspace waits to be restored; nothing may write before it. */
  blocked: boolean;
  /** Autosave stopped after a failure or conflict; only an explicit save resumes it. */
  paused: boolean;
  dirty: boolean;
  hasFile: boolean;
}

/** Drive already holds this document. */
export const upToDate = (state: SaveState) => state.hasFile && !state.dirty && !state.paused;
/** A save may start; an explicit one also runs while autosave is paused. */
export const savable = (state: SaveState, manual: boolean) =>
  state.hasFolder && !state.blocked && (manual || !state.paused);

/** After a render: drop the buffered save, stage this snapshot, or keep only a manual request. */
export function editDecision(
  state: SaveState & { autosave: boolean; uploading: boolean },
): 'clear' | 'stage' | 'clearAutomatic' {
  if (state.uploading || upToDate(state)) return 'clear';
  return state.autosave && state.dirty && savable(state, false) ? 'stage' : 'clearAutomatic';
}

/** A save request: queue it behind running work, skip it, report nothing to save, or run it. */
export function requestDecision(
  state: SaveState & {
    mode: SaveMode;
    automatic: boolean;
    /** A save or another Drive operation is underway. */
    waiting: boolean;
    /** Another operation holds Drive without having rendered as busy yet. */
    locked: boolean;
    hasDrive: boolean;
  },
): 'queue' | 'skip' | 'unchanged' | 'run' {
  if (state.waiting) return state.mode === 'normal' ? 'queue' : 'skip';
  if (!state.hasDrive || state.locked || !savable(state, !state.automatic)) return 'skip';
  if (state.mode === 'normal' && upToDate(state)) return 'unchanged';
  return 'run';
}

/** When the buffered save is due: run it, or drop it as stale. */
export const flushDecision = (
  state: SaveState & { manual: boolean; sameDocument: boolean },
): 'run' | 'drop' =>
  state.sameDocument && savable(state, state.manual) && !upToDate(state) ? 'run' : 'drop';
