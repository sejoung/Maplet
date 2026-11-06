import type { JsonObject } from './model';
import { isOneOf } from './guards';

export const FONT_SIZES = [12, 15, 20] as const;
export const FONT_FAMILIES = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  serif: 'Georgia, "Times New Roman", "AppleMyungjo", "Batang", serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;
export type FontFamily = keyof typeof FONT_FAMILIES;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const FAMILY_NAMES = Object.keys(FONT_FAMILIES) as FontFamily[];

/**
 * Older documents stored bold and italic for a whole node in `style.fontWeight` and
 * `style.fontStyle`. They still display as before; the first formatting change or title
 * edit moves them into the title, so a document only changes when the user changes it.
 */
export function legacyEmphasis(style: JsonObject) {
  return { bold: style.fontWeight === 'bold', italic: style.fontStyle === 'italic' };
}

/** A node's text settings; unknown stored values fall back to the defaults. */
export function nodeTypography(style: JsonObject) {
  const fontSize = isOneOf(FONT_SIZES, style.fontSize) ? style.fontSize : FONT_SIZES[1];
  return {
    textAlign: isOneOf(TEXT_ALIGNS, style.textAlign) ? style.textAlign : TEXT_ALIGNS[0],
    fontSize,
    fontFamily: isOneOf(FAMILY_NAMES, style.fontFamily) ? style.fontFamily : FAMILY_NAMES[0],
    ...legacyEmphasis(style),
    lineHeight: Math.round(fontSize * 1.5),
  } as const;
}
export type NodeTypography = ReturnType<typeof nodeTypography>;
