import { useMemo, useSyncExternalStore } from 'react';
import { translate, type Parameters } from './core';
import { getLanguage, subscribeLanguage } from './locale';

export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const t = useMemo(
    () => (message: string, parameters?: Parameters) => translate(message, language, parameters),
    [language],
  );
  return { language, locale: language === 'ko' ? 'ko-KR' : 'en-US', t };
}
