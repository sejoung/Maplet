import type { HighlightColor, TextFormat } from '../domain/rich-text';
import { HIGHLIGHT_FILLS, HIGHLIGHT_TEXT } from '../engine/render-metrics';

/**
 * The elements that carry inline formatting. The node display and the title editor build
 * the same markup from them, so text keeps its look and position when editing starts.
 */
export const RICH_TAGS = {
  italic: { tag: 'em', className: 'rich-italic' },
  bold: { tag: 'strong', className: 'rich-bold' },
  highlight: { tag: 'mark', className: 'rich-mark' },
} as const;

export interface RichWrapper {
  tag: (typeof RICH_TAGS)[keyof typeof RICH_TAGS]['tag'];
  className: string;
  /** Set on the highlight element, which shows its color inline. */
  highlight?: HighlightColor;
  style?: { background: string; color: string };
}

export const highlightStyle = (color: HighlightColor) => ({
  background: HIGHLIGHT_FILLS[color],
  color: HIGHLIGHT_TEXT,
});

/** The elements around a run's text, innermost first: mark > strong > em > text. */
export function richWrappers(format: TextFormat): RichWrapper[] {
  const wrappers: RichWrapper[] = [];
  if (format.italic) wrappers.push(RICH_TAGS.italic);
  if (format.bold) wrappers.push(RICH_TAGS.bold);
  if (format.highlight)
    wrappers.push({
      ...RICH_TAGS.highlight,
      highlight: format.highlight,
      style: highlightStyle(format.highlight),
    });
  return wrappers;
}
