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
