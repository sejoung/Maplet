import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMap,
  addNode,
  renameNode,
  deleteNode,
  moveNode,
  updateNode,
} from '../domain/commands';
import type { MindNode } from '../domain/model';
import { messageOf } from '../domain/errors';
import { resizeNode } from '../domain/node-size';
import { setNodePositions } from '../domain/positions';
import { autoArrange } from '../engine/auto-arrange';
import { measureNodeText } from '../components/text-measure';
import { filenameFromTitle } from '../application/document-name';
import { serializeMup } from '../adapters/mup/codec';
import { serializeMaplet } from '../adapters/maplet/codec';
import { parseDocument, nativeFilename, mupFilename } from '../adapters/documents';
import { restoreDraft, draftHasChanges } from '../adapters/storage/recovery';
import { DraftStore, type Draft } from '../adapters/storage/drafts';
import { downloadBlob, downloadFile, readMapFile } from '../adapters/storage/files';
import { stripMapExtension } from '../domain/filename';
import { Editor } from '../components/Editor';
import { Dialog } from '../components/Dialog';
import { ShortcutHelpDialog } from '../components/ShortcutHelpDialog';
import { useDrive, type DriveServices } from './useDrive';
import { useI18n } from '../i18n/react';
import type { Translatable } from '../i18n/core';
import { NewMapDialog } from '../components/NewMapDialog';
import { DriveDialogs } from './DriveDialogs';
import { useDraftPersistence } from './useDraftPersistence';
import { usePrimarySave } from './usePrimarySave';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useDraftPrivacy } from './useDraftPrivacy';
import { useDocument } from './useDocument';
import { useNodeClipboard } from './useNodeClipboard';
import { layoutMap } from '../engine/layout';
import { renderSvg } from '../engine/svg-export';
import { svgToPng } from '../adapters/storage/image';

const defaultDrafts = new DraftStore();

/** `drafts` and `driveServices` can be injected; production uses the browser defaults. */
export function App({
  drafts = defaultDrafts,
  driveServices,
}: { drafts?: DraftStore; driveServices?: DriveServices } = {}) {
  const { t, locale } = useI18n();
  const [error, setError] = useState<Translatable | null>(null);
  const [notice, setNotice] = useState<Translatable | null>(null);
  const report = useCallback(
    (reason: unknown) => setError(messageOf(reason, '작업을 완료하지 못했습니다.')),
    [],
  );
  const doc = useDocument({
    title: t('중심 주제'),
    filename: `${t('제목 없음')}.maplet`,
    onEdited: () => setError(null),
    onError: report,
  });
  const { map, content, filename, selectedId, edit } = doc;
  const [draftStatus, setDraftStatus] = useState(
    drafts.enabled ? '이 기기에만 보관' : '기기 초안 보관 꺼짐',
  );
  const draftPrivacy = useDraftPrivacy(drafts, setDraftStatus, setError);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recovery, setRecovery] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<'new' | 'help' | null>(null);

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
  }, [drafts, report]);

  useEffect(() => {
    if (!doc.dirty) return;
    const warning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warning);
    return () => window.removeEventListener('beforeunload', warning);
  }, [doc.dirty]);

  const { markDownloaded } = doc;
  const save = useCallback(() => {
    try {
      downloadFile(content, filename);
      markDownloaded();
      setNotice('파일 다운로드를 요청했습니다. 다운로드 폴더에서 .maplet 파일을 확인해 주세요.');
    } catch (reason) {
      report(reason);
    }
  }, [content, filename, markDownloaded, report]);

  const clipboard = useNodeClipboard(doc, report);
  const exportImage = async (format: 'png' | 'svg') => {
    try {
      const image = renderSvg(map, layoutMap(map, measureNodeText));
      const blob =
        format === 'svg'
          ? new Blob([image.svg], { type: 'image/svg+xml' })
          : await svgToPng(image.svg, image.width, image.height);
      downloadBlob(blob, `${stripMapExtension(filename)}.${format}`);
    } catch (reason) {
      report(reason);
    }
  };

  const replace: typeof doc.replace = (next, ...rest) => {
    doc.replace(next, ...rest);
    setError(null);
    // Each compatibility warning is an independent catalog message.
    setNotice(next.warnings.length ? next.warnings : null);
  };
  const allowReplace = () =>
    !doc.dirty ||
    window.confirm(
      t('아직 저장하지 않은 변경이 있습니다. 현재 맵을 바꿀까요? 취소 후 저장할 수 있습니다.'),
    );
  const importGeneration = useRef(0);
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
  const add = (sibling = false) => {
    const id = crypto.randomUUID();
    const added = edit((current) => {
      const node = current.nodes[selectedId];
      const asSibling = sibling && node.parentId !== null;
      return addNode(
        current,
        asSibling ? node.parentId! : selectedId,
        id,
        t('새 노드'),
        asSibling ? selectedId : undefined,
      );
    });
    if (!added) return;
    doc.setSelected(id);
    doc.setEditingId(id);
  };
  const remove = () => {
    const node = map.nodes[selectedId];
    if (
      node.children.length &&
      !window.confirm(t('이 노드와 모든 하위 노드를 삭제할까요? 실행 취소로 복원할 수 있습니다.'))
    )
      return;
    const fallback = node.parentId ?? map.roots.find((id) => id !== selectedId)!;
    if (edit((current) => deleteNode(current, selectedId))) doc.setSelected(fallback);
  };
  const recover = () => {
    if (!recovery) return;
    try {
      const restored = restoreDraft(recovery);
      replace(restored.map, restored.filename, restored.savedContent, restored.savedFilename);
      doc.setFilenamePending(recovery.filenamePending ?? false);
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

  const driveState = useDrive(
    {
      content,
      filename,
      documentKey: doc.documentKey,
      restorationReady: recoveryReady && !recovery,
      hasLocalWork: doc.hasWork,
      markSaved: doc.markSaved,
      applyMerge: doc.applyMerge,
      allowReplace,
      replace,
      setNotice,
    },
    driveServices,
  );
  const primary = usePrimarySave(driveState, save, doc.documentKey);
  const saveCurrent = useEditorShortcuts({
    save: primary.save,
    undo: doc.undo,
    redo: doc.redo,
    help: () => setDialog('help'),
  });
  useDraftPersistence(
    drafts,
    {
      content,
      original: map.original,
      filename,
      filenamePending: doc.filenamePending,
      savedContent: doc.savedContent,
      savedFilename: doc.savedFilename,
      drive: driveState.draftWorkspace,
      driveBaseline: driveState.draftBaseline,
    },
    recoveryReady && !recovery && doc.hasWork && draftPrivacy.enabled,
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
        onFilenameChange={doc.rename}
        dirty={doc.dirty}
        draftStatus={draftStatus}
        error={error}
        notice={notice}
        documentKey={doc.documentKey}
        editingId={doc.editingId}
        onCancelEdit={() => doc.setEditingId(null)}
        onSelect={doc.select}
        onEdit={(id = selectedId) => doc.setEditingId(id)}
        onAdd={add}
        onDelete={remove}
        onToggle={(id) =>
          edit((current) => updateNode(current, id, { collapsed: !current.nodes[id].collapsed }))
        }
        onRename={(id, title) => {
          const renamed = edit((current) => renameNode(current, id, title));
          if (
            renamed &&
            doc.filenamePending &&
            id === map.roots[0] &&
            title !== map.nodes[id].title
          ) {
            const name = filenameFromTitle(title);
            if (name) doc.rename(name);
          }
          if (renamed) doc.setEditingId(null);
          return renamed;
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
        onAutoLayout={() => edit((current) => autoArrange(current, measureNodeText))}
        onUndo={doc.undo}
        onRedo={doc.redo}
        canUndo={doc.canUndo}
        canRedo={doc.canRedo}
        onNew={() => setDialog('new')}
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
        onExportImage={(format) => void exportImage(format)}
        onCopyNode={clipboard.copy}
        onCutNode={clipboard.cut}
        onPasteNode={clipboard.paste}
        onDuplicateNode={clipboard.duplicate}
        onReorder={clipboard.reorder}
        canPaste={clipboard.canPaste}
        onBackup={() => {
          if (map.original)
            downloadFile(map.original, `${stripMapExtension(filename)}.original.mup`);
        }}
        onHelp={() => setDialog('help')}
        onDrive={driveState.showDrive}
        driveConfigured={driveState.configured}
        onOpenDrive={() =>
          driveState.driveReady && driveState.saveFolder && !driveState.awaitingRestore
            ? void driveState.openDrive()
            : driveState.showDrive()
        }
        onSaveCopy={() => void driveState.saveDrive('copy')}
        canSaveCopy={Boolean(driveState.driveFile)}
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
              const name = filenameFromTitle(title) ?? `${t('제목 없음')}.maplet`;
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
