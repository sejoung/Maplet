import { useI18n } from '../i18n/react';
import { LANGUAGE_NAMES, setLanguage } from '../i18n/locale';

export function LanguageSwitcher({
  id,
  variant = 'compact',
  describedBy,
}: {
  id?: string;
  variant?: 'compact' | 'field';
  describedBy?: string;
}) {
  const { language, t } = useI18n();
  return (
    <select
      id={id}
      className={variant === 'compact' ? 'language-select' : 'settings-language-select'}
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
