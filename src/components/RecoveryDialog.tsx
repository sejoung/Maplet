import { useI18n } from '../i18n/react';
import { Dialog, DialogActions } from './Dialog';

// The draft must be recovered or deleted explicitly; Escape and the close button do nothing.
const stayOpen = () => {};

/** Offers the device draft of unsaved changes found at startup. */
export function RecoveryDialog({
  filename,
  updatedAt,
  onDiscard,
  onRecover,
}: {
  filename: string;
  updatedAt: number;
  onDiscard(): void;
  onRecover(): void;
}) {
  const { t, locale } = useI18n();
  return (
    <Dialog title={t('app.recoverDraft')} onClose={stayOpen}>
      <p>{t('app.draftFound', { filename })}</p>
      <p className="muted">
        {new Date(updatedAt).toLocaleString(locale)}
        {' · '}
        {t('app.changesNotYetSavedFile')}
      </p>
      <DialogActions
        onCancel={onDiscard}
        cancelLabel={t('app.deleteDraft')}
        submitLabel={t('app.recoverDraft')}
        onSubmit={onRecover}
      />
    </Dialog>
  );
}
