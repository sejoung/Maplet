import { useI18n } from '../i18n/react';
import { setLanguage } from '../i18n/locale';

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
      aria-label={t('언어')}
      aria-describedby={describedBy}
      value={language}
      onChange={(event) => setLanguage(event.target.value === 'ko' ? 'ko' : 'en')}
    >
      <option value="ko" lang="ko">
        한국어
      </option>
      <option value="en" lang="en">
        English
      </option>
    </select>
  );
}
