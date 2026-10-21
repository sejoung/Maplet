import { useMemo, useSyncExternalStore } from 'react';
import { translate, translateMessage, type Parameters, type Translatable } from './core';
import { getLanguage, subscribeLanguage } from './locale';

export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const t = useMemo(
    () => (message: Translatable, parameters?: Parameters) =>
      typeof message === 'string'
        ? translate(message, language, parameters)
        : translateMessage(message, language),
    [language],
  );
  return { language, locale: language === 'ko' ? 'ko-KR' : 'en-US', t };
}
