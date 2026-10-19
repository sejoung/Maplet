import english from './locales/en.json';

export type Language = 'ko' | 'en';
export type Parameters = Record<string, string | number>;
type Message = string | { one: string; other: string };
const messages: Record<string, Message> = english;

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

// Match parameterized errors produced by the language-independent adapters.
const templates = Object.keys(messages)
  .filter((key) => key.includes('{'))
  .map((key) => {
    const names: string[] = [];
    const pattern = key
      .split(/(\{\w+\})/)
      .map((part) => {
        if (/^\{\w+\}$/.test(part)) {
          names.push(part.slice(1, -1));
          return '(.+?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { key, names, pattern: new RegExp(`^${pattern}$`) };
  });

export function translate(
  message: string,
  language: Language,
  parameters: Parameters = {},
): string {
  if (language === 'ko') return interpolate(message, parameters);
  if (Object.hasOwn(messages, message)) {
    const value = messages[message];
    const translated =
      typeof value === 'string' ? value : Number(parameters.count) === 1 ? value.one : value.other;
    return interpolate(translated, parameters);
  }
  for (const template of templates) {
    const match = template.pattern.exec(message);
    if (match) {
      const values = Object.fromEntries(
        template.names.map((key, index) => [key, match[index + 1]]),
      );
      return translate(template.key, language, values);
    }
  }
  // Imported files can contribute several independent compatibility notices.
  const sentences = message.split(/(?<=\.)\s+(?=[가-힣])/u);
  return sentences.length > 1
    ? sentences.map((part) => translate(part, language)).join(' ')
    : message;
}
