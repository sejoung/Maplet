import { useId, useState } from 'react';
import { readTheme, saveTheme, type Theme } from './theme';
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
  const themeId = useId();
  const [theme, setTheme] = useState(readTheme);
  return (
    <Dialog title={t('common.settings')} onClose={onClose}>
      <label htmlFor={languageId}>{t('settings.language')}</label>
      <LanguageSwitcher id={languageId} variant="field" describedBy={descriptionId} />
      <p className="muted settings-hint" id={descriptionId}>
        {t('settings.languageHint')}
      </p>
      <label htmlFor={themeId}>{t('settings.theme')}</label>
      <select
        id={themeId}
        value={theme}
        onChange={(event) => {
          const next = event.target.value as Theme;
          setTheme(next);
          saveTheme(next);
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
      <div className="dialog-actions">
        <button className="button primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Dialog>
  );
}
