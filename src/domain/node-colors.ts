export const ROOT_BACKGROUND = '#e4f0ea';
export const NODE_BACKGROUND = '#ffffff';

/** Accept only light hex colors so dark node text always stays readable. */
export function readableBackground(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.5 ? value : fallback;
}

export const nodeBackground = (style: { background?: unknown }, root: boolean) =>
  readableBackground(style.background, root ? ROOT_BACKGROUND : NODE_BACKGROUND);

/** Accent colors for borders and branch lines; they read on light and dark canvases. */
export const LINE_COLORS = ['#397760', '#3b6fb6', '#b7791f', '#c0504d', '#7d5ba6', '#5d6864'];
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

const hex = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;

export const nodeBorder = (style: { borderColor?: unknown }) => hex(style.borderColor);

/**
 * The color and line style of the connector into `id`: a branch setting on the node or the
 * nearest ancestor that has one, so a branch is styled from its top.
 */
export function branchLine(
  nodes: Record<string, { parentId: string | null; style: Record<string, unknown> }>,
  id: string,
): { color: string | null; style: LineStyle } {
  let color: string | null = null;
  let style: LineStyle | null = null;
  for (let key: string | null = id; key !== null && (!color || !style); key = nodes[key].parentId) {
    const own = nodes[key].style;
    color ??= hex(own.branchColor);
    if (!style && (LINE_STYLES as readonly unknown[]).includes(own.lineStyle))
      style = own.lineStyle as LineStyle;
  }
  return { color, style: style ?? 'solid' };
}

export const DASHES: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
};
