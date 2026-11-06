import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DriveFile, DriveFiles, DriveFolder } from '../../adapters/drive/types';
import { driveSaveTarget } from '../../adapters/formats';
import { DriveMergeConflict } from '../../application/drive-merge';
import type { DriveBaseline, DriveSnapshot } from '../../domain/merge/snapshot';
import type { SaveResult } from '../../application/drive-document-saver';
import {
  editDecision,
  flushDecision,
  requestDecision,
  type SaveMode,
} from '../../application/drive-save-decision';
import {
  EMPTY_SAVE_BUFFER,
  clearSave,
  saveDelay,
  stageSave,
  startedSave,
  type SaveBuffer,
} from '../../application/drive-save-buffer';
import type { MergeChoices } from '../../domain/merge/merge';
import { useLatest } from '../../components/shared/useLatest';
import { createDriveSaver, merge, type DriveSaver } from './state/driveRules';
import type { DriveOperation } from './useDriveOperation';

/** What a save reports back to the Drive state. */
export interface SaveEvents {
  begin(): void;
  unchanged(): void;
  success(
    result: SaveResult<DriveFile>,
    folder: DriveFolder,
    requested: DriveSnapshot,
    automatic: boolean,
  ): void;
  resolved(merged: DriveSnapshot, remote: DriveSnapshot, file: DriveFile): void;
  rebase(
    before: DriveSnapshot,
    merged: DriveSnapshot,
    remote: DriveSnapshot,
    file: DriveFile,
  ): void;
  fail(reason: unknown, automatic: boolean): void;
}
interface Options extends DriveSnapshot {
  documentKey: number;
  drive: DriveFiles | null;
  folder: DriveFolder | null;
  file: DriveFile | null;
  baseline: DriveBaseline | null;
  operation: Pick<DriveOperation, 'busy' | 'idle' | 'exclusive'>;
  blocked: boolean;
  paused: boolean;
  dirty: boolean;
  autosave?: boolean;
  copyLabel: string;
  authorize(automatic: boolean): Promise<void>;
  pickFolder(): Promise<DriveFolder | null>;
  events: SaveEvents;
}
type Conflict = DriveMergeConflict<DriveFile>;

const snapshotOf = ({ content, filename }: DriveSnapshot) => ({ content, filename });
const saveState = (options: Options) => ({
  hasFolder: Boolean(options.folder),
  blocked: options.blocked,
  paused: options.paused,
  dirty: options.dirty,
  hasFile: Boolean(options.file),
});

/** All save entry points share one active snapshot and one latest pending request. */
export function useDriveSaving(options: Options) {
  const latest = useLatest(options);
  const queueId = useRef(crypto.randomUUID());
  const active = useRef<{
    key: number;
    snapshot: DriveSnapshot;
    attempt: DriveSnapshot;
    file: DriveFile | null;
  } | null>(null);
  const buffer = useRef(EMPTY_SAVE_BUFFER);
  const [bufferVersion, setBufferVersion] = useState(0);
  /** Store the next buffer; a changed one reschedules the save timer. */
  const update = useCallback((next: SaveBuffer) => {
    if (next === buffer.current) return;
    buffer.current = next;
    setBufferVersion((value) => value + 1);
  }, []);
  const stage = useCallback(
    (key: number, snapshot: DriveSnapshot, manual = false) =>
      update(stageSave(buffer.current, key, snapshot, Date.now(), manual)),
    [update],
  );
  const saver = useRef<DriveSaver | null>(null);
  if (!saver.current && options.drive) saver.current = createDriveSaver(options.drive);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const conflictKey = useRef<number | null>(null);
  const showConflict = (next: Conflict, key: number) => {
    setConflict(next);
    conflictKey.current = key;
  };
  useLayoutEffect(() => {
    const decision = editDecision({
      ...saveState(options),
      autosave: Boolean(options.autosave),
      uploading:
        active.current?.key === options.documentKey &&
        active.current.snapshot.content === options.content &&
        active.current.snapshot.filename === options.filename,
    });
    if (decision === 'stage') stage(options.documentKey, options);
    else update(clearSave(buffer.current, decision === 'clearAutomatic'));
  }, [options, stage, update]);
  const performSave = async (mode: SaveMode = 'normal', automatic = false) => {
    const state = latest.current;
    const decision = requestDecision({
      ...saveState(state),
      mode,
      automatic,
      waiting: Boolean(active.current) || state.operation.busy,
      locked: !state.operation.idle(),
      hasDrive: Boolean(state.drive),
    });
    if (decision === 'queue') stage(state.documentKey, state, !automatic);
    if (decision === 'unchanged' && !automatic) state.events.unchanged();
    if (decision !== 'run') return;
    const drive = state.drive!,
      key = state.documentKey,
      requested = snapshotOf(state);
    await state.operation.exclusive(async (latestOperation, generation) => {
      const current = () => latestOperation() && key === latest.current.documentKey;
      buffer.current = clearSave(buffer.current);
      active.current = { key, snapshot: requested, attempt: requested, file: state.file };
      setConflict(null);
      state.events.begin();
      try {
        await state.authorize(automatic);
        if (!current()) return;
        const folder = mode === 'copy' ? await state.pickFolder() : state.folder;
        if (!folder || !current()) return;
        const target = driveSaveTarget(
          requested.filename,
          state.file,
          mode === 'copy',
          state.copyLabel,
        );
        buffer.current = startedSave(buffer.current, key, Date.now());
        const result =
          target.create || !state.file
            ? {
                file: await drive.create(
                  target.name,
                  requested.content,
                  folder.id,
                  `${queueId.current}:${key}:${generation}:${folder.id}:${mode}`,
                ),
                content: requested.content,
                filename: target.name,
              }
            : await saver.current!.save(
                state.file,
                { ...requested, filename: target.name },
                state.baseline,
                mode === 'overwrite',
                current,
                state.events.rebase,
                (snapshot) => {
                  if (active.current?.key === key) active.current.attempt = snapshot;
                },
              );
        if (!current()) return;
        setConflict(null);
        state.events.success(result, folder, requested, automatic);
      } catch (reason) {
        if (!current()) return;
        buffer.current = clearSave(buffer.current);
        if (reason instanceof DriveMergeConflict) {
          // Edits made during the save take part; a clean result is saved again at once.
          const next = merge.remerge(reason as Conflict, snapshotOf(latest.current));
          if ('merged' in next) {
            state.events.resolved(next.merged, reason.remote, reason.remoteFile);
            stage(key, next.merged, true);
            return;
          }
          showConflict(next.conflict, key);
          state.events.fail(next.conflict, automatic);
        } else state.events.fail(reason, automatic);
      } finally {
        active.current = null;
      }
    });
  };
  const save = async (mode: SaveMode = 'normal', automatic = false) => {
    if (automatic && mode === 'normal') stage(latest.current.documentKey, latest.current);
    else await performSave(mode, automatic);
  };
  const latestSave = useLatest(performSave);
  const { busy } = options.operation;
  const { documentKey, blocked, paused, dirty, file, folder, content, filename } = options;
  useEffect(() => {
    const request = buffer.current.pending;
    if (busy || active.current || !request) return;
    const decision = flushDecision({
      hasFolder: Boolean(folder),
      blocked,
      paused,
      dirty,
      hasFile: Boolean(file),
      manual: request.manual,
      sameDocument: request.key === documentKey,
    });
    if (decision === 'drop') {
      buffer.current = clearSave(buffer.current);
      return;
    }
    const delay = saveDelay(buffer.current, Date.now());
    if (!delay) {
      void latestSave.current('normal', !request.manual);
      return;
    }
    const timer = window.setTimeout(() => {
      void latestSave.current('normal', !request.manual);
    }, delay);
    return () => window.clearTimeout(timer);
    // Content changes reschedule the timer without entering the decision.
  }, [
    bufferVersion,
    busy,
    documentKey,
    blocked,
    paused,
    content,
    filename,
    dirty,
    file,
    folder,
    latestSave,
  ]);
  const resolve = (choices: MergeChoices) => {
    const state = latest.current;
    if (!conflict || conflictKey.current !== state.documentKey || state.operation.busy) return;
    // Re-evaluate against current edits, so closing the dialog to keep editing is safe.
    const next = merge.remerge(conflict, snapshotOf(state), choices);
    if ('conflict' in next) return setConflict(next.conflict);
    state.events.resolved(next.merged, conflict.remote, conflict.remoteFile);
    setConflict(null);
    stage(state.documentKey, next.merged, true);
  };
  return {
    save,
    attempt: options.file
      ? active.current?.key === options.documentKey && active.current.file?.id === options.file.id
        ? active.current.attempt
        : saver.current?.pending(options.file.id)
      : undefined,
    conflict: conflictKey.current === options.documentKey ? conflict : null,
    resolve,
    capture: (reason: unknown) => {
      setConflict(null);
      if (reason instanceof DriveMergeConflict)
        showConflict(reason as Conflict, latest.current.documentKey);
    },
    clear: () => {
      buffer.current = clearSave(buffer.current);
      setConflict(null);
    },
  };
}
