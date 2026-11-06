import { useCallback, useState } from 'react';
import { createMap } from '../domain/commands';
import { messageOf } from '../domain/errors';
import type { MindMap } from '../domain/model';
import { measureNodeText } from '../components/text-measure';
import { filenameFromTitle } from '../application/document-name';
import { serializeMaplet } from '../adapters/maplet/codec';
import { nativeFilename } from '../adapters/formats';
import { restoreDraft } from '../adapters/storage/recovery';
import type { DraftRepository } from '../adapters/storage/drafts';
import { FRESH_TAB, openNewMapTab, type TabSession } from '../adapters/storage/tab-session';
import { downloadFile } from '../adapters/storage/files';
import { Editor } from '../components/Editor';
import { DriveDialogs } from '../components/DriveDialogs';
import { RecoveryDialog } from '../components/RecoveryDialog';
import { ShortcutHelpDialog } from '../components/ShortcutHelpDialog';
import { NewMapDialog } from '../components/NewMapDialog';
import { useI18n } from '../i18n/react';
import type { Translatable } from '../i18n/core';
import { useDrive, type DriveServices } from './useDrive';
import { useDraftPersistence } from './useDraftPersistence';
import { useDraftRecovery } from './useDraftRecovery';
import { usePrimarySave } from './usePrimarySave';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useDraftPrivacy } from './useDraftPrivacy';
import { useDocument } from './useDocument';
import { useNodeClipboard } from './useNodeClipboard';
import { useNodeCommands } from './useNodeCommands';
import { useExports } from './useExports';
import { useConfirm } from './useConfirm';
import { useFileImport } from './useFileImport';
import { useUnloadWarning } from './useUnloadWarning';
import { useDeletedNotice } from './useDeletedNotice';
import { useRunOnce } from './useRunOnce';

/** The composition root (`main.tsx`) builds the stores; tests inject their own. */
export function App({
  drafts,
  driveServices,
  tab = FRESH_TAB,
}: {
  drafts: DraftRepository;
  driveServices?: DriveServices;
  tab?: TabSession;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<Translatable | null>(null);
  const [notice, setNotice] = useState<Translatable | null>(null);
  const deleted = useDeletedNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialog, setDialog] = useState<'new' | 'help' | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const report = useCallback(
    (reason: unknown) => setError(messageOf(reason, 'app.couldNotCompleteOperation')),
    [],
  );
  const doc = useDocument({
    title: t('common.centralTopic'),
    filename: `${t('app.untitled')}.maplet`,
    onEdited: () => {
      setError(null);
      deleted.clear();
    },
    onError: report,
  });
  const { map, content, filename, selectedId } = doc;
  const [draftStatus, setDraftStatus] = useState(
    drafts.enabled ? 'app.storedDeviceOnly' : 'app.deviceDraftStorageOff',
  );
  const draftPrivacy = useDraftPrivacy(drafts, setDraftStatus, setError);
  useUnloadWarning(doc.dirty);

  const { markDownloaded } = doc;
  const download = useCallback(() => {
    try {
      downloadFile(content, filename);
      markDownloaded();
      setNotice('app.downloadRequestedCheckDownloadsFolder');
    } catch (reason) {
      report(reason);
    }
  }, [content, filename, markDownloaded, report]);

  const replace: typeof doc.replace = (next, ...rest) => {
    doc.replace(next, ...rest);
    setError(null);
    deleted.clear();
    // Each compatibility warning is an independent catalog message.
    setNotice(next.warnings.length ? next.warnings : null);
  };
  /** A map from this device: it belongs to no Drive file until saved there. */
  const replaceWithLocal = (next: MindMap, name: string, lastSaved?: string) => {
    replace(next, name, lastSaved);
    drive.clearFile(serializeMaplet(next), nativeFilename(name));
  };
  const allowReplace = async () =>
    !doc.dirty ||
    confirm({
      title: t('app.unsavedChangesTitle'),
      message: t('app.confirmReplaceUnsaved'),
      confirmLabel: t('app.discardChangesOpen'),
      danger: true,
    });
  const recovery = useDraftRecovery(drafts, tab, {
    apply: (draft) => {
      const restored = restoreDraft(draft);
      replace(restored.map, restored.filename, restored.savedContent, restored.savedFilename);
      doc.setFilenamePending(draft.filenamePending ?? false);
      drive.draft.restore(draft.drive, draft.driveBaseline);
      setNotice('app.draftRecoveredDeviceDownloadFile');
    },
    report,
  });
  const drive = useDrive(
    {
      content,
      filename,
      documentKey: doc.documentKey,
      restorationReady: recovery.settled,
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
  const importFile = useFileImport({
    allowReplace,
    measure: measureNodeText,
    open: replaceWithLocal,
    report,
  });
  const createNewMap = (title: string) =>
    replaceWithLocal(
      createMap(title),
      filenameFromTitle(title) ?? `${t('app.untitled')}.maplet`,
      '',
    );
  useRunOnce(tab.newMap !== null, () => createNewMap(tab.newMap!));

  const clipboard = useNodeClipboard(doc, report);
  const commands = useNodeCommands(doc, { t, measure: measureNodeText, onDeleted: deleted.show });
  const exports = useExports(map, filename, { report, setNotice, measure: measureNodeText });
  const undo = () => {
    deleted.clear();
    doc.undo();
  };
  const primary = usePrimarySave(drive, download);
  const saveCurrent = useEditorShortcuts({
    save: primary.save,
    undo,
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
      drive: drive.draft.workspace,
      driveBaseline: drive.draft.baseline,
    },
    recovery.settled && doc.hasWork && draftPrivacy.enabled,
    setDraftStatus,
    setError,
  );

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
        onUndo={undo}
        deletedNotice={deleted.notice(undo)}
        onRedo={doc.redo}
        canUndo={doc.canUndo}
        canRedo={doc.canRedo}
        onNew={() => setDialog('new')}
        onOpen={(file) => void importFile(file)}
        onSave={saveCurrent}
        onDownload={download}
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
        onDrive={drive.showDrive}
        onDriveRenew={() => void drive.renewDrive()}
        driveConfigured={drive.configured}
        onOpenDrive={() => void drive.openDrive()}
        onSaveCopy={() => void drive.saveDrive('copy')}
        canSaveCopy={Boolean(drive.driveFile)}
        driveConnected={drive.connected}
        driveBusy={drive.busy}
        driveSaveStatus={drive.autoSaveStatus}
        onDismissError={() => setError(null)}
        onDismissNotice={() => setNotice(null)}
      />
      {recovery.offered && (
        <RecoveryDialog
          filename={recovery.offered.filename}
          updatedAt={recovery.offered.updatedAt}
          onDiscard={() => void recovery.discard()}
          onRecover={recovery.recover}
        />
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
      <DriveDialogs {...drive.dialogs} onDownload={download} />
      {confirmDialog}
    </>
  );
}
