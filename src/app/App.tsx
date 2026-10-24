import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMap } from '../domain/commands';
import { messageOf } from '../domain/errors';
import { stripMapExtension } from '../domain/filename';
import { autoArrange } from '../engine/auto-arrange';
import { measureNodeText } from '../components/text-measure';
import { filenameFromTitle } from '../application/document-name';
import { serializeMaplet } from '../adapters/maplet/codec';
import { parseDocument, nativeFilename } from '../adapters/documents';
import { isOutlineName, parseOutline } from '../adapters/outline/outline';
import { restoreDraft, draftHasChanges } from '../adapters/storage/recovery';
import { DraftStore, type Draft, type StoredDraft } from '../adapters/storage/drafts';
import { FRESH_TAB, openNewMapTab, type TabSession } from '../adapters/storage/tab-session';
import { downloadFile, readMapFile } from '../adapters/storage/files';
import { Editor } from '../components/Editor';
import { Dialog } from '../components/Dialog';
import { ShortcutHelpDialog } from '../components/ShortcutHelpDialog';
import { NewMapDialog } from '../components/NewMapDialog';
import { useI18n } from '../i18n/react';
import type { Translatable } from '../i18n/core';
import { useDrive, type DriveServices } from './useDrive';
import { DriveDialogs } from './DriveDialogs';
import { useDraftPersistence } from './useDraftPersistence';
import { usePrimarySave } from './usePrimarySave';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useDraftPrivacy } from './useDraftPrivacy';
import { useDocument } from './useDocument';
import { useNodeClipboard } from './useNodeClipboard';
import { useNodeCommands } from './useNodeCommands';
import { useExports } from './useExports';

const defaultDrafts = new DraftStore();

/** `drafts`, `driveServices` and `tab` can be injected; production uses the browser defaults. */
export function App({
  drafts = defaultDrafts,
  driveServices,
  tab = FRESH_TAB,
}: { drafts?: DraftStore; driveServices?: DriveServices; tab?: TabSession } = {}) {
  const { t, locale } = useI18n();
  const [error, setError] = useState<Translatable | null>(null);
  const [notice, setNotice] = useState<Translatable | null>(null);
  const report = useCallback(
    (reason: unknown) => setError(messageOf(reason, 'app.couldNotCompleteOperation')),
    [],
  );
  const doc = useDocument({
    title: t('common.centralTopic'),
    filename: `${t('app.untitled')}.maplet`,
    onEdited: () => setError(null),
    onError: report,
  });
  const { map, content, filename, selectedId } = doc;
  const [draftStatus, setDraftStatus] = useState(
    drafts.enabled ? 'app.storedDeviceOnly' : 'app.deviceDraftStorageOff',
  );
  const draftPrivacy = useDraftPrivacy(drafts, setDraftStatus, setError);
  const [recoveryReady, setRecoveryReady] = useState(false);
  // This tab's own draft (`key` null) first, then drafts of closed tabs, newest first.
  const [recoveries, setRecoveries] = useState<{ key: string | null; draft: Draft }[]>([]);
  const recovery = recoveries[0]?.draft ?? null;
  const [dialog, setDialog] = useState<'new' | 'help' | null>(null);

  useEffect(() => {
    let active = true;
    const candidates = async () => {
      // A tab opened for a new map starts empty; closed tabs' drafts wait for another visit.
      if (tab.newMap !== null) return [];
      const own = await drafts.load();
      const others: StoredDraft[] = await drafts.others(tab.live);
      // Drafts without unsaved changes have nothing left to recover.
      for (const stale of others.filter(({ draft }) => !draftHasChanges(draft)))
        void drafts.remove(stale.key).catch(() => {});
      return [
        ...(own && draftHasChanges(own) ? [{ key: null, draft: own }] : []),
        ...others.filter(({ draft }) => draftHasChanges(draft)),
      ];
    };
    candidates()
      .then((found) => {
        if (active) setRecoveries(found);
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
  }, [drafts, report, tab]);

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
      setNotice('app.downloadRequestedCheckDownloadsFolder');
    } catch (reason) {
      report(reason);
    }
  }, [content, filename, markDownloaded, report]);

  const clipboard = useNodeClipboard(doc, report);
  const replace: typeof doc.replace = (next, ...rest) => {
    doc.replace(next, ...rest);
    setError(null);
    // Each compatibility warning is an independent catalog message.
    setNotice(next.warnings.length ? next.warnings : null);
  };
  const allowReplace = () => !doc.dirty || window.confirm(t('app.confirmReplaceUnsaved'));
  const importGeneration = useRef(0);
  const open = async (file: File) => {
    const generation = ++importGeneration.current;
    try {
      const source = await readMapFile(file);
      // Outlines arrive without a layout; balance their branches like Auto arrange.
      const next = isOutlineName(file.name)
        ? autoArrange(
            parseOutline(source, file.name, stripMapExtension(file.name)),
            measureNodeText,
          )
        : parseDocument(source);
      if (generation !== importGeneration.current || !allowReplace()) return;
      replace(next, file.name);
      driveState.clearFile(serializeMaplet(next), nativeFilename(file.name));
    } catch (reason) {
      if (generation === importGeneration.current) report(reason);
    }
  };
  const commands = useNodeCommands(doc, t);
  const exports = useExports(map, filename, report, setNotice);
  const recover = () => {
    const [candidate] = recoveries;
    if (!candidate) return;
    try {
      const { key, draft } = candidate;
      const restored = restoreDraft(draft);
      replace(restored.map, restored.filename, restored.savedContent, restored.savedFilename);
      doc.setFilenamePending(draft.filenamePending ?? false);
      driveState.restoreDraftWorkspace(draft.drive, draft.driveBaseline);
      // Other closed tabs' drafts stay for a later visit rather than replacing this one.
      setRecoveries([]);
      setNotice('app.draftRecoveredDeviceDownloadFile');
      // Take over a closed tab's draft: keep it in this tab's slot before deleting the old one.
      if (key)
        void drafts
          .save(draft)
          .then(() => drafts.remove(key))
          .catch(report);
    } catch (reason) {
      report(reason);
    }
  };
  const discardRecovery = async () => {
    const [candidate, ...rest] = recoveries;
    if (!candidate) return;
    try {
      await (candidate.key ? drafts.remove(candidate.key) : drafts.clear());
      setRecoveries(rest);
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
      tab,
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
  const createNewMap = (title: string) => {
    const next = createMap(title);
    const name = filenameFromTitle(title) ?? `${t('app.untitled')}.maplet`;
    replace(next, name, '');
    driveState.clearFile(serializeMaplet(next), name);
  };
  const latestCreate = useRef(createNewMap);
  useLayoutEffect(() => {
    latestCreate.current = createNewMap;
  });
  const startedNewMap = useRef(false);
  useEffect(() => {
    if (tab.newMap === null || startedNewMap.current) return;
    startedNewMap.current = true;
    latestCreate.current(tab.newMap);
  }, [tab.newMap]);
  const closeDialog = useCallback(() => setDialog(null), []);
  const preventRecoveryClose = useCallback(() => {}, []);

  return (
    <>
      <Editor
        draftPrivacy={draftPrivacy}
        map={map}
        selected={selectedId}
        selection={doc.selection}
        onToggleSelect={doc.toggleSelect}
        onSelectNodes={doc.selectNodes}
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
        {...commands}
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
        {...exports}
        onCopyNode={clipboard.copy}
        onCutNode={clipboard.cut}
        onPasteNode={clipboard.paste}
        onDuplicateNode={clipboard.duplicate}
        onReorder={clipboard.reorder}
        canPaste={clipboard.canPaste}
        onHelp={() => setDialog('help')}
        onDrive={driveState.showDrive}
        onDriveRenew={() => void driveState.renewDrive()}
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
        <Dialog title={t('app.recoverDraft')} onClose={preventRecoveryClose}>
          <p>{t('app.draftFound', { filename: recovery.filename })}</p>
          <p className="muted">
            {new Date(recovery.updatedAt).toLocaleString(locale)}
            {' · '}
            {t('app.changesNotYetSavedFile')}
          </p>
          <div className="dialog-actions">
            <button className="button quiet" onClick={() => void discardRecovery()}>
              {t('app.deleteDraft')}
            </button>
            <button className="button primary" onClick={recover}>
              {t('app.recoverDraft')}
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'new' && (
        <NewMapDialog
          onClose={closeDialog}
          onCreate={(title) => {
            // Work already in this tab stays open; the new map gets its own tab.
            if (doc.hasWork) openNewMapTab(title);
            else createNewMap(title);
            setDialog(null);
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
