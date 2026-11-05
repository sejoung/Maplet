import type { MindNode } from '../domain/model';
import { characterWidth, nodeTypography } from '../domain/typography';
import { nodeMarkers } from '../domain/node-markers';
import { richRuns, type TextRun } from '../domain/rich-text';
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_BORDER,
  sizeValue,
} from '../domain/node-size';

/** Width of `text` in the node's font; `bold` marks inline bold inside the title. */
export type TextMeasurer = (text: string, node: MindNode, bold?: boolean) => number;
export const estimateTextWidth: TextMeasurer = (text, node, bold = false) => {
  const typography = nodeTypography(node.style);
  const font = { ...typography, bold: typography.bold || bold };
  return [...text].reduce((sum, char) => sum + characterWidth(char, font), 0);
};
export interface MeasuredRun extends TextRun {
  width: number;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Wrap the formatted title into lines. `raw` measures the title as typed, markers included,
 * which is what the inline editor shows.
 */
export function measureNode(
  node: MindNode,
  measureText: TextMeasurer = estimateTextWidth,
  raw = false,
) {
  const typography = nodeTypography(node.style);
  const width = sizeValue(node.style.width, MIN_NODE_WIDTH);
  // Icons and task boxes sit before the text and take part of the content width.
  const insetX =
    2 * (NODE_PADDING_X + NODE_BORDER) + nodeMarkers(node.style, typography.fontSize).width;
  const contentWidth = (width ?? 236) - insetX;
  const runs: MeasuredRun[][] = [];
  let line: MeasuredRun[] = [];
  let lineWidth = 0;
  const finishLine = () => {
    runs.push(line);
    line = [];
    lineWidth = 0;
  };
  const source = raw ? [{ text: node.title, bold: false, highlight: null }] : richRuns(node.title);
  for (const [index, run] of source.entries()) {
    const measure = (text: string) => measureText(text, node, run.bold);
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
