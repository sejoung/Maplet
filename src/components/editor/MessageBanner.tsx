import { X } from 'lucide-react';
import type { Translatable } from '../../i18n/core';
import { useI18n } from '../../i18n/react';

const KINDS = {
  // Errors interrupt; notices wait for a pause.
  error: { role: 'alert', dismiss: 'editor.dismissError' },
  notice: { role: 'status', dismiss: 'editor.dismissNotification' },
} as const;

/** A dismissible message under the toolbar, with an optional follow-up action. */
export function MessageBanner({
  kind,
  message,
  onDismiss,
  action,
}: {
  kind: keyof typeof KINDS;
  message: Translatable;
  onDismiss(): void;
  action?: { label: Translatable; run(): void };
}) {
  const { t } = useI18n();
  const { role, dismiss } = KINDS[kind];
  return (
    <div className={`message ${kind}`} role={role}>
      <span>{t(message)}</span>
      {action && (
        <button type="button" className="text-button" onClick={action.run}>
          {t(action.label)}
        </button>
      )}
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
