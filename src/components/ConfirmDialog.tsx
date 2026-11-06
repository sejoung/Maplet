import { useI18n } from '../i18n/react';
import { Dialog } from './Dialog';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Names the action, e.g. "Discard changes and open", never a bare "OK". */
  confirmLabel: string;
  danger?: boolean;
}

/** An in-app replacement for `window.confirm`; Cancel takes the focus so Enter is safe. */
export function ConfirmDialog({
  request,
  onAnswer,
}: {
  request: ConfirmRequest;
  onAnswer(confirmed: boolean): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={request.title} onClose={() => onAnswer(false)}>
      <p>{request.message}</p>
      <div className="dialog-actions">
        <button type="button" className="button" data-autofocus onClick={() => onAnswer(false)}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`button ${request.danger ? 'danger' : 'primary'}`}
          onClick={() => onAnswer(true)}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
