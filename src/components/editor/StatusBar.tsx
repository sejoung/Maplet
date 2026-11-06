import { useI18n } from '../../i18n/react';

/** Save state, the device draft or Drive autosave state, and selection and node counts. */
export function StatusBar({
  dirty,
  draftStatus,
  driveSaveStatus,
  selectedCount,
  nodeCount,
}: {
  dirty: boolean;
  draftStatus: string;
  /** Shown instead of the draft state while Drive autosaves; the header's sync state announces it. */
  driveSaveStatus: string | null;
  selectedCount: number;
  nodeCount: number;
}) {
  const { t } = useI18n();
  return (
    <footer className="status-bar">
      <div className="save-status" role="status" aria-live={driveSaveStatus ? 'off' : 'polite'}>
        <span className={`status-dot ${dirty ? 'pending' : ''}`} />
        <span>{dirty ? t('common.unsavedChanges') : t('editor.noFileChanges')}</span>
        <span className="status-separator">·</span>
        <span title={t(draftStatus)}>{t(driveSaveStatus ?? draftStatus)}</span>
      </div>
      <div className="status-tools">
        {selectedCount > 1 && (
          <span className="selection-count" role="status">
            {t('editor.selectedCount', { count: selectedCount })}
          </span>
        )}
        <span className="node-count">{t('editor.nodeCount', { count: nodeCount })}</span>
      </div>
    </footer>
  );
}
