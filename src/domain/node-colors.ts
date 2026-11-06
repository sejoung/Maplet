import { isOneOf } from './guards';
import { lineage, type Tree, type TreeNode } from './tree';

export const ROOT_BACKGROUND = '#e4f0ea';
export const NODE_BACKGROUND = '#ffffff';

const hexColor = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;

/** Accept only light hex colors so dark node text always stays readable. */
export function readableBackground(value: unknown, fallback: string): string {
  const hex = hexColor(value);
  if (!hex) return fallback;
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.5 ? hex : fallback;
}

export const nodeBackground = (style: { background?: unknown }, root: boolean) =>
  readableBackground(style.background, root ? ROOT_BACKGROUND : NODE_BACKGROUND);

/** Accent colors for borders and branch lines; they read on light and dark canvases. */
export const LINE_COLORS = ['#397760', '#3b6fb6', '#b7791f', '#c0504d', '#7d5ba6', '#5d6864'];
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

export const nodeBorder = (style: { borderColor?: unknown }) => hexColor(style.borderColor);

/**
 * The color and line style of the connector into `id`: a branch setting on the node or the
 * nearest ancestor that has one, so a branch is styled from its top.
 */
export function branchLine(
  tree: Tree<TreeNode & { style: Record<string, unknown> }>,
  id: string,
): { color: string | null; style: LineStyle } {
  let color: string | null = null;
  let style: LineStyle | null = null;
  for (const key of lineage(tree, id)) {
    const own = tree.nodes[key].style;
    color ??= hexColor(own.branchColor);
    if (!style && isOneOf(LINE_STYLES, own.lineStyle)) style = own.lineStyle;
    if (color && style) break;
  }
  return { color, style: style ?? 'solid' };
}
