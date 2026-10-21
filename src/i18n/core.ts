import english from './locales/en.json';
import korean from './locales/ko.json';

export type Language = 'ko' | 'en';
export type Parameters = Record<string, string | number>;
type CatalogEntry = string | { one: string; other: string };
/** Messages are looked up by stable keys such as `menu.copy`; Korean is the fallback language. */
const catalogs: Record<Language, Record<string, CatalogEntry>> = { ko: korean, en: english };
export type MessageKey = keyof typeof korean;
// Releases before keys stored Korean source sentences (e.g. import warnings in saved files).
const legacyKeys = new Map(Object.entries(korean).map(([key, text]) => [text, key]));

export function detectLanguage(preferred: readonly string[], saved?: string | null): Language {
  if (saved === 'ko' || saved === 'en') return saved;
  for (const value of preferred) {
    const base = value.toLowerCase().split(/[-_]/)[0];
    if (base === 'ko' || base === 'en') return base;
  }
  return 'en';
}

function interpolate(message: string, parameters: Parameters): string {
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder,
  );
}

export function translate(
  message: string,
  language: Language,
  parameters: Parameters = {},
): string {
  const key = Object.hasOwn(catalogs.ko, message) ? message : legacyKeys.get(message);
  // Text that is not a catalog message (such as a browser error) is shown as it is.
  if (key === undefined) return interpolate(message, parameters);
  const value = Object.hasOwn(catalogs[language], key) ? catalogs[language][key] : catalogs.ko[key];
  const translated =
    typeof value === 'string' ? value : Number(parameters.count) === 1 ? value.one : value.other;
  return interpolate(translated, parameters);
}

/** Matches the domain `Message` structurally, keeping i18n free of other layers. */
export interface Message {
  key: string;
  params?: Parameters;
}
/** Catalog key, structured message (e.g. an error), or independent notices shown together. */
export type Translatable = string | Message | readonly Translatable[];

export function translateMessage(message: Translatable, language: Language): string {
  if (typeof message === 'string') return translate(message, language);
  if (isList(message)) return message.map((part) => translateMessage(part, language)).join(' ');
  return translate(message.key, language, message.params);
}
const isList = (message: Translatable): message is readonly Translatable[] =>
  Array.isArray(message);
