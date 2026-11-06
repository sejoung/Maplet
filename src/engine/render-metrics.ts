import type { JsonObject } from '../domain/model';
import type { LineStyle } from '../domain/node-colors';
import { nodeMarkers } from '../domain/node-markers';
import type { HighlightColor } from '../domain/rich-text';

/** Pixel sizes and paints shared by the canvas, text measurement and the SVG export. */
export const NODE_PADDING_X = 12;
export const NODE_PADDING_Y = 6;
export const NODE_BORDER = 1;
export const TASK_SIZE = 16;
export const MARKER_GAP = 6;
/** Dark text that stays readable on every node background and highlight. */
export const NODE_TEXT = '#25352d';

/** Pastel fills that keep dark text readable in light and dark themes and in exports. */
export const HIGHLIGHT_FILLS: Record<HighlightColor, string> = {
  yellow: '#fde68a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
};
export const HIGHLIGHT_TEXT = NODE_TEXT;

/** SVG `stroke-dasharray` values per branch line style. */
export const DASHES: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
};

/** The markers shown before a node's text and the width they take, in pixels. */
export function markerMetrics(style: JsonObject, fontSize: number) {
  const { icon, task } = nodeMarkers(style);
  const iconSize = Math.round(fontSize * 1.25);
  const width = (task ? TASK_SIZE + MARKER_GAP : 0) + (icon ? iconSize + MARKER_GAP : 0);
  return { icon, task, iconSize, width };
}
