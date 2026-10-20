import { useId } from 'react';
import { useI18n } from '../i18n/react';
import { Dialog } from './Dialog';
import { LanguageSwitcher } from './LanguageSwitcher';

export function SettingsDialog({
  onClose,
  draftPrivacy,
}: {
  onClose(): void;
  draftPrivacy?: { enabled: boolean; busy: boolean; change(enabled: boolean): void };
}) {
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
      {draftPrivacy && (
        <div className="draft-privacy">
          <label>
            <input
              type="checkbox"
              checked={draftPrivacy.enabled}
              disabled={draftPrivacy.busy}
              onChange={(event) => draftPrivacy.change(event.target.checked)}
            />
            {t('이 기기에 편집 초안 보관')}
          </label>
          <p className="muted">
            {t(
              '초안은 이 브라우저에 암호화 없이 보관됩니다. 끄면 보관된 초안을 삭제하고 이후 초안을 저장하지 않습니다. 현재 편집과 Drive 파일은 유지됩니다.',
            )}
          </p>
        </div>
      )}
      <div className="dialog-actions">
        <button className="button primary" onClick={onClose}>
          {t('완료')}
        </button>
      </div>
    </Dialog>
  );
}
