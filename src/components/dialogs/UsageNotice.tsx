import { useId } from 'react';
import { useI18n } from '../../i18n/react';

/** The one-time card, over the bottom of the canvas, saying that usage statistics are sent. */
export function UsageNotice({ onAccept, onDecline }: { onAccept(): void; onDecline(): void }) {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <section className="usage-notice" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('usage.title')}</h2>
      <p>{t('usage.notice')}</p>
      <div className="usage-notice-actions">
        <button type="button" className="button" onClick={onDecline}>
          {t('usage.turnOff')}
        </button>
        <button type="button" className="button primary" onClick={onAccept}>
          {t('usage.accept')}
        </button>
      </div>
    </section>
  );
}
