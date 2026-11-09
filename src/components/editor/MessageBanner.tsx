import { X } from 'lucide-react';
import type { Translatable } from '../../i18n/core';
import { useI18n } from '../../i18n/react';

const KINDS = {
  // Errors interrupt; notices wait for a pause.
  error: { role: 'alert', dismiss: 'editor.dismissError' },
  notice: { role: 'status', dismiss: 'editor.dismissNotification' },
} as const;

/** A dismissible message under the toolbar. */
export function MessageBanner({
  kind,
  message,
  onDismiss,
}: {
  kind: keyof typeof KINDS;
  message: Translatable;
  onDismiss(): void;
}) {
  const { t } = useI18n();
  const { role, dismiss } = KINDS[kind];
  return (
    <div className={`message ${kind}`} role={role}>
      <span>{t(message)}</span>
      <button className="icon-button" aria-label={t(dismiss)} onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}

/** A deletion of several nodes, with its undo; floats over the canvas so the map stays put. */
export function DeletedToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: Translatable;
  onUndo(): void;
  onDismiss(): void;
}) {
  const { t } = useI18n();
  return (
    <div className="canvas-toast" role="status">
      <span>{t(message)}</span>
      <button
        type="button"
        className="text-button"
        aria-label={t('app.undoDelete')}
        onClick={onUndo}
      >
        {t('common.undo')}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('editor.dismissNotification')}
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}
