import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { DriveClient, type DriveFile } from '../adapters/drive/client';
import { driveSaveTarget } from '../adapters/documents';
import type { GoogleSelection } from '../adapters/drive/google';
import { DriveDocumentSaver, type SaveResult } from './DriveDocumentSaver';
import {
  DriveMergeConflict,
  mergeDriveSnapshots,
  type DriveBaseline,
  type DriveSnapshot,
} from './driveMerge';
import type { MergeChoices } from '../domain/merge';
import { DriveSaveBuffer } from '../application/drive-save-buffer';

type Mode = 'normal' | 'copy' | 'overwrite';
interface Options extends DriveSnapshot {
  documentKey: number;
  drive: DriveClient | null;
  folder: GoogleSelection | null;
  file: DriveFile | null;
  baseline: DriveBaseline | null;
  busy: boolean;
  blocked: boolean;
  paused: boolean;
  dirty: boolean;
  autosave?: boolean;
  inFlight: MutableRefObject<boolean>;
  generation: MutableRefObject<number>;
  copyLabel: string;
  authorize(automatic: boolean): Promise<void>;
  pickFolder(): Promise<GoogleSelection | null>;
  begin(): void;
  finish(): void;
  unchanged(): void;
  success(
    result: SaveResult,
    folder: GoogleSelection,
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

/** All save entry points share one active snapshot and one latest pending request. */
export function useDriveSaving(options: Options) {
  const latest = useRef(options);
  const queueId = useRef(crypto.randomUUID());
  const active = useRef<{
    key: number;
    snapshot: DriveSnapshot;
    attempt: DriveSnapshot;
    file: DriveFile | null;
  } | null>(null);
  const buffer = useRef(new DriveSaveBuffer());
  const [bufferVersion, setBufferVersion] = useState(0);
  const stage = useCallback((key: number, snapshot: DriveSnapshot, manual = false) => {
    if (buffer.current.stage(key, snapshot, Date.now(), manual))
      setBufferVersion((value) => value + 1);
  }, []);
  const saver = useRef<DriveDocumentSaver | null>(null);
  if (!saver.current && options.drive) saver.current = new DriveDocumentSaver(options.drive);
  const [conflict, setConflict] = useState<DriveMergeConflict | null>(null);
  const conflictKey = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = options;
    const sameActive =
      active.current?.key === options.documentKey &&
      active.current.snapshot.content === options.content &&
      active.current.snapshot.filename === options.filename;
    if (sameActive || (options.file && !options.dirty && !options.paused)) {
      if (buffer.current.clear()) setBufferVersion((value) => value + 1);
    } else if (
      options.autosave &&
      options.dirty &&
      !options.paused &&
      !options.blocked &&
      options.folder
    )
      stage(options.documentKey, options);
    else if (buffer.current.clear(true)) setBufferVersion((value) => value + 1);
  }, [options, stage]);
  const performSave = async (mode: Mode = 'normal', automatic = false) => {
    const state = latest.current;
    if (active.current) {
      if (mode === 'normal') stage(state.documentKey, state, !automatic);
      return;
    }
    if (state.busy) {
      if (mode === 'normal') stage(state.documentKey, state, !automatic);
      return;
    }
    if (
      !state.drive ||
      !state.folder ||
      state.blocked ||
      state.busy ||
      state.inFlight.current ||
      (automatic && state.paused)
    )
      return;
    if (mode === 'normal' && state.file && !state.dirty && !state.paused) {
      if (!automatic) state.unchanged();
      return;
    }
    const key = state.documentKey,
      generation = state.generation.current;
    const current = () =>
      key === latest.current.documentKey && generation === state.generation.current;
    const requested = { content: state.content, filename: state.filename };
    buffer.current.clear();
    active.current = { key, snapshot: requested, attempt: requested, file: state.file };
    state.inFlight.current = true;
    setConflict(null);
    state.begin();
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
      buffer.current.started(key, Date.now());
      const result =
        target.create || !state.file
          ? {
              file: await state.drive.create(
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
              state.rebase,
              (snapshot) => {
                if (active.current?.key === key) active.current.attempt = snapshot;
              },
            );
      if (!current()) return;
      setConflict(null);
      state.success(result, folder, requested, automatic);
    } catch (reason) {
      if (!current()) return;
      buffer.current.clear();
      let failure = reason;
      if (reason instanceof DriveMergeConflict) {
        const shown = mergeDriveSnapshots(reason.base, latest.current, reason.remote);
        if (!shown.conflicts.length) {
          state.resolved(shown, reason.remote, reason.remoteFile);
          stage(key, shown, true);
          return;
        }
        failure = new DriveMergeConflict(
          reason.base,
          latest.current,
          reason.remote,
          shown.conflicts,
          reason.remoteFile,
        );
        setConflict(failure as DriveMergeConflict);
        conflictKey.current = key;
      }
      state.fail(failure, automatic);
    } finally {
      active.current = null;
      state.inFlight.current = false;
      state.finish();
    }
  };
  const save = async (mode: Mode = 'normal', automatic = false) => {
    if (automatic && mode === 'normal') stage(latest.current.documentKey, latest.current);
    else await performSave(mode, automatic);
  };
  const latestSave = useRef(performSave);
  useLayoutEffect(() => {
    latestSave.current = performSave;
  });
  useEffect(() => {
    if (options.busy || active.current || !buffer.current.pending) return;
    const request = buffer.current.pending;
    if (
      request.key !== options.documentKey ||
      options.blocked ||
      !options.folder ||
      (!request.manual && options.paused) ||
      (!options.dirty && options.file && !options.paused)
    ) {
      buffer.current.clear();
      return;
    }
    const delay = buffer.current.delay(Date.now());
    if (!delay) {
      void latestSave.current('normal', !request.manual);
      return;
    }
    const timer = window.setTimeout(() => {
      void latestSave.current('normal', !request.manual);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    bufferVersion,
    options.busy,
    options.documentKey,
    options.blocked,
    options.paused,
    options.content,
    options.filename,
    options.dirty,
    options.file,
    options.folder,
  ]);
  const resolve = (choices: MergeChoices) => {
    const state = latest.current;
    if (!conflict || conflictKey.current !== state.documentKey || state.busy) return;
    // Re-evaluate against current edits, so closing the dialog to keep editing is safe.
    const allChoices = { ...conflict.choices, ...choices };
    const merged = mergeDriveSnapshots(conflict.base, state, conflict.remote, allChoices);
    if (merged.conflicts.length) {
      setConflict(
        new DriveMergeConflict(
          conflict.base,
          state,
          conflict.remote,
          merged.conflicts,
          conflict.remoteFile,
          allChoices,
        ),
      );
      return;
    }
    state.resolved(merged, conflict.remote, conflict.remoteFile);
    setConflict(null);
    stage(state.documentKey, merged, true);
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
      if (reason instanceof DriveMergeConflict) {
        setConflict(reason);
        conflictKey.current = latest.current.documentKey;
      }
    },
    clear: () => {
      buffer.current.clear();
      setConflict(null);
    },
  };
}
