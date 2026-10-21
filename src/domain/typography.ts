import type { JsonObject } from './model';

export const FONT_SIZES = [12, 15, 20] as const;
export const FONT_FAMILIES = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  serif: 'Georgia, "Times New Roman", "AppleMyungjo", "Batang", serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;

export function nodeTypography(style: JsonObject) {
  const textAlign =
    style.textAlign === 'center' || style.textAlign === 'right' ? style.textAlign : 'left';
  const fontSize = style.fontSize === 12 || style.fontSize === 20 ? style.fontSize : 15;
  const fontFamily =
    style.fontFamily === 'serif' || style.fontFamily === 'mono' ? style.fontFamily : 'sans';
  return {
    textAlign,
    fontSize,
    fontFamily,
    bold: style.fontWeight === 'bold',
    italic: style.fontStyle === 'italic',
    lineHeight: Math.round(fontSize * 1.5),
  } as const;
}

// Conservative glyph widths keep wrapping deterministic without browser APIs.
export function characterWidth(char: string, typography: ReturnType<typeof nodeTypography>) {
  const units =
    char.codePointAt(0)! > 127
      ? 1
      : typography.fontFamily === 'mono'
        ? 0.62
        : /[MWmw@%&]/.test(char)
          ? 1
          : /[A-Z]/.test(char)
            ? 0.85
            : 0.65;
  return units * typography.fontSize * (typography.bold ? 1.08 : 1);
}
