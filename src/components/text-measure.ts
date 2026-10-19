import type { MindNode } from '../domain/model';
import { FONT_FAMILIES, nodeTypography } from '../domain/typography';
import { estimateTextWidth } from '../engine/node-measure';

let context: CanvasRenderingContext2D | null = null;
let activeFont = '';
const widths = new Map<string, number>();

export function measureNodeText(text: string, node: MindNode): number {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return estimateTextWidth(text, node);
  const { fontSize, fontFamily } = nodeTypography(node.style);
  const font = `${node.parentId === null ? 600 : 400} ${fontSize}px ${FONT_FAMILIES[fontFamily]}`;
  const key = `${font}\n${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  if (activeFont !== font) {
    context.font = font;
    activeFont = font;
  }
  context.fontKerning = 'normal';
  const width = context.measureText(text).width;
  if (widths.size >= 4096) widths.clear();
  widths.set(key, width);
  return width;
}

export function clearTextMeasurements() {
  widths.clear();
}
