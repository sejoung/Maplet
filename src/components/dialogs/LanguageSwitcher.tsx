import { useI18n } from '../../i18n/react';
import type { Language } from '../../i18n/core';
import { LANGUAGE_NAMES, setLanguage } from '../../i18n/locale';
import { isOneOf } from '../../domain/util/guards';

// The names table lists every supported language once.
const LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[];

/** The language field of the settings dialog. */
export function LanguageSwitcher({ id, describedBy }: { id?: string; describedBy?: string }) {
  const { language, t } = useI18n();
  return (
    <select
      id={id}
      aria-label={t('settings.language')}
      aria-describedby={describedBy}
      value={language}
      onChange={(event) => {
        const next = event.target.value;
        if (isOneOf(LANGUAGES, next)) setLanguage(next);
      }}
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code} lang={code}>
          {LANGUAGE_NAMES[code]}
        </option>
      ))}
    </select>
  );
}
