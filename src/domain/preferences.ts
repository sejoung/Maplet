import type { HighlightColor } from './rich-text/rich-text';

export const THEMES = ['system', 'light', 'dark'] as const;
/** `system` follows the operating system; the others pin the palette. */
export type Theme = (typeof THEMES)[number];

/** Choices of this browser rather than of any document. */
export interface Preferences {
  theme: Theme;
  /** The highlighter color shared by the toolbar, the text menu and the shortcut. */
  highlight: HighlightColor;
  minimap: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  highlight: 'yellow',
  minimap: true,
};
