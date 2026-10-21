import english from './locales/en.json';

export type Language = 'ko' | 'en';
export type Parameters = Record<string, string | number>;
type CatalogEntry = string | { one: string; other: string };
const messages: Record<string, CatalogEntry> = english;

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
  if (language === 'ko' || !Object.hasOwn(messages, message))
    return interpolate(message, parameters);
  const value = messages[message];
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
