import { useId } from 'react';
import { isOneOf } from '../../domain/util/guards';
import { THEMES } from '../../domain/preferences';
import { usePreferences } from '../shared/preferences';
import { useI18n } from '../../i18n/react';
import { Dialog, DialogActions } from './Dialog';
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
  const themeId = useId();
  const [{ theme }, updatePreferences] = usePreferences();
  return (
    <Dialog title={t('common.settings')} onClose={onClose}>
      <label htmlFor={languageId}>{t('settings.language')}</label>
      <LanguageSwitcher id={languageId} describedBy={descriptionId} />
      <p className="muted settings-hint" id={descriptionId}>
        {t('settings.languageHint')}
      </p>
      <label htmlFor={themeId}>{t('settings.theme')}</label>
      <select
        id={themeId}
        value={theme}
        onChange={(event) => {
          const next = event.target.value;
          if (isOneOf(THEMES, next)) updatePreferences({ theme: next });
        }}
      >
        <option value="system">{t('settings.matchSystem')}</option>
        <option value="light">{t('settings.light')}</option>
        <option value="dark">{t('settings.dark')}</option>
      </select>
      {draftPrivacy && (
        <div className="draft-privacy">
          <label>
            <input
              type="checkbox"
              checked={draftPrivacy.enabled}
              disabled={draftPrivacy.busy}
              onChange={(event) => draftPrivacy.change(event.target.checked)}
            />
            {t('settings.keepEditingDraftsDevice')}
          </label>
          <p className="muted">{t('settings.draftPrivacyHint')}</p>
        </div>
      )}
      <DialogActions submitLabel={t('common.done')} onSubmit={onClose} />
    </Dialog>
  );
}
