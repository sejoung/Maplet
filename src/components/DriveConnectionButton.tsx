import { Cloud, Check, CloudUpload, CloudAlert, LoaderCircle } from 'lucide-react';
import type { DriveSyncStatus } from '../application/drive-sync';
import { useI18n } from '../i18n/react';

const icons = {
  synced: Check,
  saving: LoaderCircle,
  pending: CloudUpload,
  error: CloudAlert,
  reconnect: CloudAlert,
  ready: Cloud,
} as const;

/**
 * Drive connection and sync state as one control. Autosave makes a separate save button
 * redundant; the control only asks for attention when the user has to act.
 */
export function DriveConnectionButton({
  connected,
  busy,
  sync: savedStatus,
  editing,
  onClick,
  onRetry,
}: {
  connected: boolean;
  busy: boolean;
  sync: DriveSyncStatus | null;
  editing: boolean;
  onClick(): void;
  onRetry(): void;
}) {
  const { t } = useI18n();
  const sync =
    editing && savedStatus && ['synced', 'pending', 'ready'].includes(savedStatus.kind)
      ? { kind: 'pending' as const, label: '편집 중' }
      : savedStatus;
  const label = t(connected ? 'Google Drive 연결됨' : 'Google Drive 연결');
  const Icon = sync ? icons[sync.kind] : Cloud;
  const attention = sync?.kind === 'error' || sync?.kind === 'reconnect';
  return (
    <div
      className={`drive-control${sync ? ` has-status ${sync.kind}` : ''}${attention ? ' needs-attention' : ''}`}
    >
      <button
        className={`button drive-button${connected ? ' connected' : ''}`}
        aria-haspopup="dialog"
        aria-label={label}
        title={sync ? `${label} · ${t(sync.label)}` : label}
        disabled={busy}
        onClick={onClick}
      >
        <Icon size={16} className={sync?.kind === 'saving' ? 'sync-spinner' : undefined} />
        {sync ? (
          <span className="drive-label-status">Drive</span>
        ) : (
          <>
            <span className="drive-label-full">{label}</span>
            <span className="drive-label-short" aria-hidden="true">
              Google Drive
            </span>
          </>
        )}
      </button>
      {sync && (
        <span
          className={`drive-sync-state ${sync.kind}`}
          role="status"
          aria-label={t('Drive 동기화 상태')}
          aria-atomic="true"
        >
          {t(sync.label)}
        </span>
      )}
      {sync?.kind === 'error' && (
        <button
          type="button"
          className="drive-retry"
          aria-label={t('Drive 저장 다시 시도')}
          disabled={busy}
          onClick={onRetry}
        >
          {t('다시 시도')}
        </button>
      )}
    </div>
  );
}
