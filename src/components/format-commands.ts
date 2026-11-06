import { Bold, Eraser, Italic, type LucideIcon } from 'lucide-react';
import type { FormatCommand, HighlightColor } from '../domain/rich-text';
import { HIGHLIGHT_FILLS } from '../engine/render-metrics';
import { SHORTCUTS, shortcutLabel } from './shortcuts';

export const HIGHLIGHT_LABELS: Record<HighlightColor, string> = {
  yellow: 'format.yellow',
  green: 'format.green',
  blue: 'format.blue',
  pink: 'format.pink',
};

interface FormatItem {
  command: FormatCommand;
  icon: LucideIcon;
  label: string;
  /** Tooltip with the shortcut, where the label alone is shown as an icon. */
  hint?: string;
  keys: string;
}

/** The on/off emphasis both the toolbar and the text menu offer, in their order. */
export const FORMAT_TOGGLES = [
  {
    command: { kind: 'bold' },
    icon: Bold,
    label: 'format.bold',
    hint: 'format.boldHint',
    keys: shortcutLabel(SHORTCUTS.bold, 'format'),
  },
  {
    command: { kind: 'italic' },
    icon: Italic,
    label: 'format.italic',
    hint: 'format.italicHint',
    keys: shortcutLabel(SHORTCUTS.italic, 'format'),
  },
] as const satisfies readonly FormatItem[];

export const CLEAR_FORMAT = {
  command: { kind: 'clear' },
  icon: Eraser,
  label: 'format.clear',
  keys: shortcutLabel(SHORTCUTS.clearFormat, 'format'),
} as const satisfies FormatItem;

/** What every highlighter swatch shows: its fill, named for screen readers and tooltips. */
export const swatchProps = (color: HighlightColor, t: (key: string) => string) => ({
  className: 'format-swatch',
  'aria-label': t(HIGHLIGHT_LABELS[color]),
  title: t(HIGHLIGHT_LABELS[color]),
  style: { background: HIGHLIGHT_FILLS[color] },
});
