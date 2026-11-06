import type { MindNode } from '../domain/model';
import { nodeTypography, type NodeTypography } from '../domain/typography';
import { richRuns, type TextRun } from '../domain/rich-text';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH, sizeValue } from '../domain/node-size';
import { markerMetrics, NODE_BORDER, NODE_PADDING_X, NODE_PADDING_Y } from './render-metrics';

/** Width of a node without a set width, before it wraps. */
const DEFAULT_NODE_WIDTH = 236;

// Conservative glyph widths keep wrapping deterministic without browser APIs.
function characterWidth(char: string, typography: NodeTypography) {
  const units =
    char.codePointAt(0)! > 127
      ? 1
      : typography.fontFamily === 'mono'
        ? 0.62
        : /[MWmw@%&]/.test(char)
          ? 1
          : /[A-Z]/.test(char)
            ? 0.85
            : 0.65;
  return units * typography.fontSize * (typography.bold ? 1.08 : 1);
}

/** Width of `text` in the node's font, with any inline bold or italic of that text. */
export type TextMeasurer = (
  text: string,
  node: MindNode,
  inline?: { bold?: boolean; italic?: boolean },
) => number;
export const estimateTextWidth: TextMeasurer = (text, node, inline = {}) => {
  const typography = nodeTypography(node.style);
  const font = { ...typography, bold: typography.bold || Boolean(inline.bold) };
  return [...text].reduce((sum, char) => sum + characterWidth(char, font), 0);
};
export interface MeasuredRun extends TextRun {
  width: number;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Wrap the formatted title into lines of runs. */
export function measureNode(node: MindNode, measureText: TextMeasurer = estimateTextWidth) {
  const typography = nodeTypography(node.style);
  const width = sizeValue(node.style.width, MIN_NODE_WIDTH);
  // Icons and task boxes sit before the text and take part of the content width.
  const insetX =
    2 * (NODE_PADDING_X + NODE_BORDER) + markerMetrics(node.style, typography.fontSize).width;
  const contentWidth = (width ?? DEFAULT_NODE_WIDTH) - insetX;
  const runs: MeasuredRun[][] = [];
  let line: MeasuredRun[] = [];
  let lineWidth = 0;
  const finishLine = () => {
    runs.push(line);
    line = [];
    lineWidth = 0;
  };
  const source = richRuns(node.title);
  for (const [index, run] of source.entries()) {
    const measure = (text: string) =>
      measureText(text, node, { bold: run.bold, italic: run.italic });
    let piece = '';
    const finishPiece = () => {
      if (!piece) return;
      const pieceWidth = measure(piece);
      line.push({ ...run, text: piece, width: pieceWidth });
      lineWidth += pieceWidth;
      piece = '';
    };
    for (const [part, paragraph] of run.text.split('\n').entries()) {
      if (part > 0) {
        finishPiece();
        finishLine();
      }
      for (const { segment } of graphemes.segment(paragraph)) {
        if ((piece || line.length) && lineWidth + measure(piece + segment) > contentWidth) {
          finishPiece();
          finishLine();
        }
        piece += segment;
      }
    }
    finishPiece();
    if (index === source.length - 1) finishLine();
  }
  if (!source.length) finishLine();
  const lines = runs.map((parts) => parts.map((part) => part.text).join(''));
  const lineWidths = runs.map((parts) => parts.reduce((sum, part) => sum + part.width, 0));
  return {
    width: width ?? Math.max(MIN_NODE_WIDTH, Math.ceil(Math.max(...lineWidths) + insetX)),
    // Old height metadata stays in files, but text determines the visible height.
    height: Math.max(
      MIN_NODE_HEIGHT,
      lines.length * typography.lineHeight + 2 * (NODE_PADDING_Y + NODE_BORDER),
    ),
    lines,
    runs,
  };
}
