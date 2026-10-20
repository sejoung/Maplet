import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMap,
  addNode,
  renameNode,
  deleteNode,
  moveNode,
  updateNode,
} from '../domain/commands';
import type { MindMap, MindNode } from '../domain/model';
import { resizeNode } from '../domain/node-size';
import { setNodePositions, resetNodePositions } from '../domain/positions';
import { commit, createHistory, undo, redo } from '../application/history';
import { filenameFromTitle } from '../application/document-name';
import { serializeMup } from '../adapters/mup/codec';
import { serializeMaplet } from '../adapters/maplet/codec';
import { parseDocument, nativeFilename, mupFilename } from '../adapters/documents';
import { restoreDraft, draftHasChanges } from '../adapters/storage/recovery';
import { DraftStore, type Draft } from '../adapters/storage/drafts';
import { downloadFile, readMapFile } from '../adapters/storage/files';
import { Editor } from '../components/Editor';
import { Dialog } from '../components/Dialog';
import { ShortcutHelpDialog } from '../components/ShortcutHelpDialog';
import { useDrive } from './useDrive';
import { useI18n } from '../i18n/react';
import { NewMapDialog } from '../components/NewMapDialog';
import { DriveDialogs } from './DriveDialogs';
import { useDraftPersistence } from './useDraftPersistence';
import { usePrimarySave } from './usePrimarySave';
import { mergeHistory } from '../application/merge-history';
import { parseMaplet } from '../adapters/maplet/codec';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useDraftPrivacy } from './useDraftPrivacy';

const drafts = new DraftStore();

export function App() {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState(() => createHistory(createMap(t('중심 주제'))));
  const map = history.present;
  const content = useMemo(() => serializeMaplet(map), [map]);
  const [savedContent, setSavedContent] = useState(content);
  const [filename, setFilename] = useState(() => `${t('제목 없음')}.maplet`);
  const [filenamePending, setFilenamePending] = useState(true);
  const [savedFilename, setSavedFilename] = useState(filename);
  const [selected, setSelected] = useState(map.roots[0]);
  const [documentKey, setDocumentKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState(
    drafts.enabled ? '이 기기에만 보관' : '기기 초안 보관 꺼짐',
  );
  const draftPrivacy = useDraftPrivacy(drafts, setDraftStatus, setError);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recovery, setRecovery] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<'new' | 'help' | null>(null);
  const hasWork = useRef(false);
  const importGeneration = useRef(0);
  const dirty = content !== savedContent || filename !== savedFilename;
  const selectedId = map.nodes[selected] ? selected : map.roots[0];
  const report = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : '작업을 완료하지 못했습니다.');

  useEffect(() => {
    let active = true;
    drafts
      .load()
      .then((draft) => {
        if (active && draft && draftHasChanges(draft)) setRecovery(draft);
      })
      .catch((reason) => {
        if (active) report(reason);
      })
      .finally(() => {
        if (active) setRecoveryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warning);
    return () => window.removeEventListener('beforeunload', warning);
  }, [dirty]);

  const save = useCallback(() => {
    try {
      downloadFile(content, filename);
      setSavedContent(content);
      setSavedFilename(filename);
      setNotice('파일 다운로드를 요청했습니다. 다운로드 폴더에서 .maplet 파일을 확인해 주세요.');
    } catch (reason) {
      report(reason);
    }
  }, [content, filename]);

  const edit = (action: (current: MindMap) => MindMap) => {
    try {
      const next = action(map);
      hasWork.current = true;
      setHistory((current) => commit(current, next));
      setError(null);
      return true;
    } catch (reason) {
      report(reason);
      return false;
    }
  };

  const replace = (next: MindMap, name: string, lastSaved?: string, lastSavedName?: string) => {
    hasWork.current = true;
    setEditingId(null);
    setHistory(createHistory(next));
    setSelected(next.roots[0]);
    setFilename(nativeFilename(name));
    setFilenamePending(false);
    setSavedFilename(lastSavedName ?? nativeFilename(name));
    setSavedContent(lastSaved ?? serializeMaplet(next));
    setDocumentKey((key) => key + 1);
    setError(null);
    setNotice(next.warnings.length ? next.warnings.join(' ') : null);
  };
  const allowReplace = () =>
    !dirty ||
    window.confirm(
      t('아직 저장하지 않은 변경이 있습니다. 현재 맵을 바꿀까요? 취소 후 저장할 수 있습니다.'),
    );
  const open = async (file: File) => {
    const generation = ++importGeneration.current;
    try {
      const next = parseDocument(await readMapFile(file));
      if (generation !== importGeneration.current || !allowReplace()) return;
      replace(next, file.name);
      driveState.clearFile(serializeMaplet(next), nativeFilename(file.name));
    } catch (reason) {
      if (generation === importGeneration.current) report(reason);
    }
  };
  const select = (id: string) => {
    if (!map.nodes[id]) return;
    let parent = map.nodes[id].parentId;
    let next = map;
    while (parent) {
      if (next.nodes[parent].collapsed) next = updateNode(next, parent, { collapsed: false });
      parent = next.nodes[parent].parentId;
    }
    if (next !== map) edit(() => next);
    setSelected(id);
  };
  const editTitle = (id = selectedId) => setEditingId(id);
  const add = (sibling = false) => {
    const id = crypto.randomUUID();
    const node = map.nodes[selectedId];
    try {
      const next = addNode(
        map,
        sibling && node.parentId ? node.parentId : selectedId,
        id,
        t('새 노드'),
        sibling && node.parentId ? selectedId : undefined,
      );
      edit(() => next);
      setSelected(id);
      editTitle(id);
    } catch (reason) {
      report(reason);
    }
  };
  const remove = () => {
    const node = map.nodes[selectedId];
    if (
      node.children.length &&
      !window.confirm(t('이 노드와 모든 하위 노드를 삭제할까요? 실행 취소로 복원할 수 있습니다.'))
    )
      return;
    const fallback = node.parentId ?? map.roots.find((id) => id !== selectedId);
    try {
      const next = deleteNode(map, selectedId);
      edit(() => next);
      setSelected(fallback!);
    } catch (reason) {
      report(reason);
    }
  };
  const recover = () => {
    if (!recovery) return;
    try {
      const restored = restoreDraft(recovery);
      replace(restored.map, restored.filename, restored.savedContent, restored.savedFilename);
      setFilenamePending(recovery.filenamePending ?? false);
      driveState.restoreDraftWorkspace(recovery.drive, recovery.driveBaseline);
      setRecovery(null);
      setNotice('이 기기의 초안을 복구했습니다. 파일로 다운로드해 보관하세요.');
    } catch (reason) {
      report(reason);
    }
  };
  const discardRecovery = async () => {
    try {
      await drafts.clear();
      setRecovery(null);
    } catch (reason) {
      report(reason);
    }
  };

  const driveState = useDrive({
    content,
    filename,
    documentKey,
    restorationReady: recoveryReady && !recovery,
    hasLocalWork: hasWork.current,
    markSaved: (saved, name = filename) => {
      setSavedContent(saved);
      setSavedFilename(name);
      setFilename((current) => (current === filename ? name : current));
    },
    applyMerge: (base, incoming) => {
      if (base.content !== incoming.content)
        setHistory((current) =>
          mergeHistory(current, parseMaplet(base.content), parseMaplet(incoming.content)),
        );
      if (base.filename !== incoming.filename)
        setFilename((current) => (current === base.filename ? incoming.filename : current));
    },
    allowReplace,
    replace,
    setNotice,
  });
  const primary = usePrimarySave(driveState, save, documentKey);
  const saveCurrent = useEditorShortcuts({
    save: primary.save,
    undo: () => {
      setHistory(undo);
      hasWork.current = true;
    },
    redo: () => {
      setHistory(redo);
      hasWork.current = true;
    },
    help: () => setDialog('help'),
  });
  useDraftPersistence(
    drafts,
    {
      content,
      original: map.original,
      filename,
      filenamePending,
      savedContent,
      savedFilename,
      drive: driveState.draftWorkspace,
      driveBaseline: driveState.draftBaseline,
    },
    recoveryReady && !recovery && hasWork.current && draftPrivacy.enabled,
    setDraftStatus,
    setError,
  );
  const closeDialog = useCallback(() => setDialog(null), []);
  const preventRecoveryClose = useCallback(() => {}, []);

  return (
    <>
      <Editor
        draftPrivacy={draftPrivacy}
        map={map}
        selected={selectedId}
        filename={filename}
        onFilenameChange={(name) => {
          hasWork.current = true;
          setFilename(name);
          setFilenamePending(false);
        }}
        dirty={dirty}
        draftStatus={draftStatus}
        error={error}
        notice={notice}
        documentKey={documentKey}
        editingId={editingId}
        onCancelEdit={() => setEditingId(null)}
        onSelect={select}
        onEdit={editTitle}
        onAdd={add}
        onDelete={remove}
        onToggle={(id) =>
          edit((current) => updateNode(current, id, { collapsed: !current.nodes[id].collapsed }))
        }
        onRename={(id, title) => {
          const saved = edit((current) => renameNode(current, id, title));
          if (saved && filenamePending && id === map.roots[0] && title !== map.nodes[id].title) {
            const name = filenameFromTitle(title);
            if (name) {
              setFilename(name);
              setFilenamePending(false);
            }
          }
          if (saved) setEditingId(null);
          return saved;
        }}
        onUpdate={(
          id,
          patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>,
        ) => edit((current) => updateNode(current, id, patch))}
        onMove={(id, parent) => edit((current) => moveNode(current, id, parent))}
        onResize={(id, width, positions) =>
          edit((current) => resizeNode(current, id, width, positions))
        }
        onReposition={(positions) => edit((current) => setNodePositions(current, positions))}
        onAutoLayout={() => edit((current) => resetNodePositions(current))}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onNew={() => {
          setDialog('new');
        }}
        onOpen={(file) => void open(file)}
        onSave={saveCurrent}
        onDownload={save}
        saveToDrive={primary.saveToDrive}
        driveSync={primary.sync}
        onExportMup={() => {
          try {
            downloadFile(serializeMup(map), mupFilename(filename));
            setNotice('.mup 호환 파일을 내보냈습니다. Maplet 원본은 .maplet 저장으로 보관하세요.');
          } catch (reason) {
            report(reason);
          }
        }}
        onBackup={() => {
          if (map.original)
            downloadFile(map.original, filename.replace(/\.maplet$/i, '') + '.original.mup');
        }}
        onHelp={() => setDialog('help')}
        onDrive={driveState.showDrive}
        driveConnected={driveState.connected}
        driveBusy={driveState.busy}
        driveSaveStatus={driveState.autoSaveStatus}
        onDismissError={() => setError(null)}
        onDismissNotice={() => setNotice(null)}
      />
      {recovery && (
        <Dialog title={t('초안 복구')} onClose={preventRecoveryClose}>
          <p>
            {t('이 기기에 저장된 {filename} 초안이 있습니다.', { filename: recovery.filename })}
          </p>
          <p className="muted">
            {new Date(recovery.updatedAt).toLocaleString(locale)}
            {' · '}
            {t('아직 파일로 저장하지 않은 변경')}
          </p>
          <div className="dialog-actions">
            <button className="button quiet" onClick={() => void discardRecovery()}>
              {t('초안 삭제')}
            </button>
            <button className="button primary" onClick={recover}>
              {t('초안 복구')}
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'new' && (
        <NewMapDialog
          onClose={closeDialog}
          onCreate={(title) => {
            if (allowReplace()) {
              const next = createMap(title);
              const name = `${title.slice(0, 80)}.maplet`;
              replace(next, name, '');
              driveState.clearFile(serializeMaplet(next), name);
              setDialog(null);
            }
          }}
        />
      )}
      {dialog === 'help' && (
        <ShortcutHelpDialog onClose={closeDialog} saveToDrive={primary.saveToDrive} />
      )}
      <DriveDialogs controller={driveState} save={save} />
    </>
  );
}
