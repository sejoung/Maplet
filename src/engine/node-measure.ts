import type { MindNode } from '../domain/model';
import { characterWidth, nodeTypography } from '../domain/typography';
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_BORDER,
  sizeValue,
} from '../domain/node-size';

export type TextMeasurer = (text: string, node: MindNode) => number;
export const estimateTextWidth: TextMeasurer = (text, node) => {
  const typography = nodeTypography(node.style);
  return [...text].reduce((sum, char) => sum + characterWidth(char, typography), 0);
};
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function measureNode(node: MindNode, measureText: TextMeasurer = estimateTextWidth) {
  const typography = nodeTypography(node.style);
  const width = sizeValue(node.style.width, MIN_NODE_WIDTH);
  const insetX = 2 * (NODE_PADDING_X + NODE_BORDER);
  const contentWidth = (width ?? 236) - insetX;
  const lines: string[] = [];
  for (const paragraph of node.title.split('\n')) {
    let line = '';
    for (const { segment } of graphemes.segment(paragraph)) {
      if (line && measureText(line + segment, node) > contentWidth) {
        lines.push(line);
        line = '';
      }
      line += segment;
    }
    lines.push(line);
  }
  return {
    width:
      width ??
      Math.max(
        MIN_NODE_WIDTH,
        Math.ceil(Math.max(...lines.map((text) => measureText(text, node))) + insetX),
      ),
    // Old height metadata stays in files, but text determines the visible height.
    height: Math.max(
      MIN_NODE_HEIGHT,
      lines.length * typography.lineHeight + 2 * (NODE_PADDING_Y + NODE_BORDER),
    ),
    lines,
  };
}
