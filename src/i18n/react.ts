import { useMemo, useSyncExternalStore } from 'react';
import { translateMessage, type Parameters, type Translatable } from './core';
import { getLanguage, subscribeLanguage } from './locale';

export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const t = useMemo(
    () => (message: Translatable, parameters?: Parameters) =>
      translateMessage(message, language, parameters),
    [language],
  );
  return { language, locale: language === 'ko' ? 'ko-KR' : 'en-US', t };
}
