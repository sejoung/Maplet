import { useId } from 'react';
import { useI18n } from '../i18n/react';
import { Dialog } from './Dialog';
import { LanguageSwitcher } from './LanguageSwitcher';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const languageId = useId();
  const descriptionId = useId();
  return (
    <Dialog title={t('설정')} onClose={onClose}>
      <label htmlFor={languageId}>{t('언어')}</label>
      <LanguageSwitcher id={languageId} variant="field" describedBy={descriptionId} />
      <p className="muted settings-hint" id={descriptionId}>
        {t('변경 즉시 적용되며 다음 방문에도 유지됩니다.')}
      </p>
      <div className="dialog-actions">
        <button className="button primary" onClick={onClose}>
          {t('완료')}
        </button>
      </div>
    </Dialog>
  );
}
