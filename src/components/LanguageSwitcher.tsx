import { useI18n } from '../i18n/react';
import { LANGUAGE_NAMES, setLanguage } from '../i18n/locale';

/** The language field of the settings dialog. */
export function LanguageSwitcher({ id, describedBy }: { id?: string; describedBy?: string }) {
  const { language, t } = useI18n();
  return (
    <select
      id={id}
      aria-label={t('settings.language')}
      aria-describedby={describedBy}
      value={language}
      onChange={(event) => setLanguage(event.target.value === 'ko' ? 'ko' : 'en')}
    >
      {(['ko', 'en'] as const).map((code) => (
        <option key={code} value={code} lang={code}>
          {LANGUAGE_NAMES[code]}
        </option>
      ))}
    </select>
  );
}
