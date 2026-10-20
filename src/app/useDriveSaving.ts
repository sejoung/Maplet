import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
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
  inFlight: MutableRefObject<boolean>;
  generation: MutableRefObject<number>;
  copyLabel: string;
  authorize(automatic: boolean): Promise<void>;
  pickFolder(): Promise<GoogleSelection | null>;
  begin(): void;
  finish(): void;
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
  const queued = useRef<{ key: number; automatic: boolean } | null>(null);
  const saver = useRef<DriveDocumentSaver | null>(null);
  if (!saver.current && options.drive) saver.current = new DriveDocumentSaver(options.drive);
  const [conflict, setConflict] = useState<DriveMergeConflict | null>(null);
  const conflictKey = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = options;
    if (
      active.current?.key === options.documentKey &&
      (active.current.snapshot.content !== options.content ||
        active.current.snapshot.filename !== options.filename)
    ) {
      queued.current ??= { key: options.documentKey, automatic: true };
    }
  });
  const save = async (mode: Mode = 'normal', automatic = false) => {
    const state = latest.current;
    if (active.current) {
      if (mode === 'normal')
        queued.current = {
          key: state.documentKey,
          automatic: automatic && (queued.current?.automatic ?? true),
        };
      return;
    }
    if (state.busy) {
      if (mode === 'normal') queued.current = { key: state.documentKey, automatic };
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
    if (automatic && state.file && !state.dirty && !state.paused) return;
    const key = state.documentKey,
      generation = state.generation.current;
    const current = () =>
      key === latest.current.documentKey && generation === state.generation.current;
    const requested = { content: state.content, filename: state.filename };
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
      queued.current = null;
      let failure = reason;
      if (reason instanceof DriveMergeConflict) {
        const shown = mergeDriveSnapshots(reason.base, latest.current, reason.remote);
        if (!shown.conflicts.length) {
          state.resolved(shown, reason.remote, reason.remoteFile);
          queued.current = { key, automatic: false };
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
  const latestSave = useRef(save);
  useLayoutEffect(() => {
    latestSave.current = save;
  });
  useEffect(() => {
    if (options.busy || active.current || !queued.current) return;
    const request = queued.current;
    queued.current = null;
    if (!options.dirty && options.file) return;
    if (request.key === options.documentKey && !options.blocked && !options.paused)
      void latestSave.current('normal', request.automatic);
  }, [
    options.busy,
    options.documentKey,
    options.blocked,
    options.paused,
    options.content,
    options.filename,
    options.dirty,
    options.file,
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
    queued.current = { key: state.documentKey, automatic: false };
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
      queued.current = null;
      setConflict(null);
    },
  };
}
