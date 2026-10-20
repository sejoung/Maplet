import { Cloud, Check, CloudUpload, CloudAlert, LoaderCircle } from 'lucide-react';
import type { DriveSyncStatus } from '../application/drive-sync';
import { useI18n } from '../i18n/react';

export function DriveConnectionButton({
  connected,
  busy,
  sync: savedStatus,
  editing,
  onClick,
}: {
  connected: boolean;
  busy: boolean;
  sync: DriveSyncStatus | null;
  editing: boolean;
  onClick(): void;
}) {
  const { t } = useI18n();
  const sync =
    editing && savedStatus && ['synced', 'pending', 'ready'].includes(savedStatus.kind)
      ? { kind: 'pending' as const, label: '편집 중' }
      : savedStatus;
  const label = t(connected ? 'Google Drive 연결됨' : 'Google Drive 연결');
  const Icon =
    sync?.kind === 'synced'
      ? Check
      : sync?.kind === 'saving'
        ? LoaderCircle
        : sync?.kind === 'pending'
          ? CloudUpload
          : sync?.kind === 'error' || sync?.kind === 'reconnect'
            ? CloudAlert
            : Cloud;
  return (
    <div className={`drive-control${sync ? ' has-status' : ''}`}>
      <button
        className={`button drive-button${connected ? ' connected' : ''}`}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        disabled={busy}
        onClick={onClick}
      >
        <Icon size={16} className={sync?.kind === 'saving' ? 'sync-spinner' : undefined} />
        <span className="drive-label-full">{label}</span>
        <span className="drive-label-short" aria-hidden="true">
          Google Drive
        </span>
      </button>
      {sync && (
        <span
          className={`drive-sync-state ${sync.kind}`}
          role="status"
          aria-label={t('Drive 동기화 상태')}
          aria-atomic="true"
          title={t(sync.label)}
        >
          {t(sync.label)}
        </span>
      )}
    </div>
  );
}
