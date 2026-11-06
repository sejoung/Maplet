import { useCallback, useMemo, useRef, useState } from 'react';
import { createMap, updateNode } from '../domain/commands';
import type { MindMap } from '../domain/model';
import { commit, createHistory, redo, undo, type History } from '../application/history';
import { mergeHistory } from '../application/merge-history';
import type { DriveSnapshot } from '../domain/snapshot';
import { nativeFilename } from '../adapters/formats';
import { parseMaplet, serializeMaplet } from '../adapters/maplet/codec';
import { useSelection } from './useSelection';

interface Options {
  title: string;
  filename: string;
  onEdited(): void;
  onError(reason: unknown): void;
}

/** The open document: undo history, file name and the last saved state. */
export function useDocument({ title, filename: initialFilename, onEdited, onError }: Options) {
  const [history, setHistory] = useState(() => createHistory(createMap(title)));
  // Edits and remote merges can arrive between renders; each must build on the latest.
  const latest = useRef(history);
  const update = useCallback((change: (current: History) => History) => {
    latest.current = change(latest.current);
    setHistory(latest.current);
  }, []);
  const map = history.present;
  const content = useMemo(() => serializeMaplet(map), [map]);
  const [filename, setFilename] = useState(initialFilename);
  // Until the user names the file, it follows the central topic.
  const [filenamePending, setFilenamePending] = useState(true);
  /** What the file on disk or Drive holds, for the unsaved-changes marker. */
  const [saved, setSaved] = useState({ content, filename: initialFilename });
  const selection = useSelection(map);
  const [documentKey, setDocumentKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hasWork, setHasWork] = useState(false);

  const edit = (action: (current: MindMap) => MindMap) => {
    try {
      const next = action(latest.current.present);
      setHasWork(true);
      update((current) => commit(current, next));
      onEdited();
      return true;
    } catch (reason) {
      onError(reason);
      return false;
    }
  };

  const replace = (next: MindMap, name: string, lastSaved?: string, lastSavedName?: string) => {
    const native = nativeFilename(name);
    setHasWork(true);
    setEditingId(null);
    update(() => createHistory(next));
    selection.setSelected(next.roots[0]);
    setFilename(native);
    setFilenamePending(false);
    setSaved({ content: lastSaved ?? serializeMaplet(next), filename: lastSavedName ?? native });
    setDocumentKey((key) => key + 1);
  };

  /** Select a node, expanding collapsed ancestors so it is visible. */
  const select = (id: string) => {
    const current = latest.current.present;
    if (!Object.hasOwn(current.nodes, id)) return;
    let next = current;
    for (let parent = current.nodes[id].parentId; parent; parent = next.nodes[parent].parentId)
      if (next.nodes[parent].collapsed) next = updateNode(next, parent, { collapsed: false });
    if (next !== current) edit(() => next);
    selection.setSelected(id);
  };

  const step = (direction: typeof undo) => {
    update(direction);
    setHasWork(true);
  };

  return {
    map,
    content,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dirty: content !== saved.content || filename !== saved.filename,
    savedContent: saved.content,
    filename,
    filenamePending,
    savedFilename: saved.filename,
    ...selection,
    documentKey,
    editingId,
    hasWork,
    edit,
    replace,
    select,
    setEditingId,
    setFilenamePending,
    undo: () => step(undo),
    redo: () => step(redo),
    rename: (name: string) => {
      setHasWork(true);
      setFilename(name);
      setFilenamePending(false);
    },
    markDownloaded: () => setSaved({ content, filename }),
    markSaved: (savedContent: string, name = filename) => {
      setSaved({ content: savedContent, filename: name });
      setFilename((current) => (current === filename ? name : current));
    },
    applyMerge: (base: DriveSnapshot, incoming: DriveSnapshot) => {
      if (base.content !== incoming.content)
        update((current) =>
          mergeHistory(current, parseMaplet(base.content), parseMaplet(incoming.content)),
        );
      if (base.filename !== incoming.filename)
        setFilename((current) => (current === base.filename ? incoming.filename : current));
    },
  };
}
export type DocumentState = ReturnType<typeof useDocument>;
