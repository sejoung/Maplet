import { HIGHLIGHT_COLORS, HIGHLIGHT_FILLS, HIGHLIGHT_TEXT } from '../domain/rich-text';
import type { HighlightColor, TextRun } from '../domain/rich-text';

/** Plain-text position of the selection inside the editor, in UTF-16 units. */
export interface TextSelection {
  start: number;
  end: number;
}

const isColor = (value: string | undefined): value is HighlightColor =>
  HIGHLIGHT_COLORS.includes(value as HighlightColor);
/** An empty last line needs a placeholder to be shown; it is not part of the text. */
const isPlaceholder = (node: Node) =>
  node instanceof HTMLElement && node.dataset.placeholder !== undefined;
const lastLeaf = (root: Node): Node | null => {
  let node = root.lastChild;
  while (node?.lastChild) node = node.lastChild;
  return node;
};
const isBlock = (node: Node) => node instanceof HTMLElement && /^(DIV|P)$/.test(node.tagName);

/** Draw runs as editable DOM using the same elements as the node display. */
export function renderRuns(editor: HTMLElement, runs: TextRun[]) {
  const nodes = runs.map((run) => {
    let node: Node = document.createTextNode(run.text);
    if (run.bold) {
      const strong = document.createElement('strong');
      strong.className = 'rich-bold';
      strong.append(node);
      node = strong;
    }
    if (run.highlight) {
      const mark = document.createElement('mark');
      mark.className = 'rich-mark';
      mark.dataset.highlight = run.highlight;
      mark.style.background = HIGHLIGHT_FILLS[run.highlight];
      mark.style.color = HIGHLIGHT_TEXT;
      mark.append(node);
      node = mark;
    }
    return node;
  });
  const text = runs.map((run) => run.text).join('');
  if (!text || text.endsWith('\n')) {
    const placeholder = document.createElement('br');
    placeholder.dataset.placeholder = '';
    nodes.push(placeholder);
  }
  editor.replaceChildren(...nodes);
}

/**
 * Read the editor back as runs. Only our own bold and highlight elements carry formatting.
 * Line breaks are `\n` text; a `<br>` the browser leaves at the very end shows no line.
 */
export function readRuns(root: Node, trailingBreak = false): TextRun[] {
  const last = lastLeaf(root);
  const runs: TextRun[] = [];
  const push = (text: string, bold: boolean, highlight: HighlightColor | null) => {
    const last = runs.at(-1);
    if (last && last.bold === bold && last.highlight === highlight) last.text += text;
    else if (text) runs.push({ text, bold, highlight });
  };
  const visit = (node: Node, bold: boolean, highlight: HighlightColor | null, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) return push(node.textContent ?? '', bold, highlight);
    if (!(node instanceof HTMLElement) || isPlaceholder(node)) return;
    if (node.tagName === 'BR')
      return node === last && !trailingBreak ? undefined : push('\n', bold, highlight);
    // Browsers may wrap a new line in a block; it starts on its own line.
    if (isBlock(node) && !first) push('\n', bold, highlight);
    const nextBold = bold || node.tagName === 'STRONG' || node.tagName === 'B';
    const color = node.tagName === 'MARK' ? node.dataset.highlight : undefined;
    const nextHighlight = isColor(color) ? color : highlight;
    node.childNodes.forEach((child, index) =>
      visit(child, nextBold, nextHighlight, first && index === 0),
    );
  };
  root.childNodes.forEach((child, index) => visit(child, false, null, index === 0));
  return runs.filter((run) => run.text);
}

const textLength = (root: Node, trailingBreak = false) =>
  readRuns(root, trailingBreak).reduce((sum, run) => sum + run.text.length, 0);

/** The current selection as plain-text offsets, or null when it is outside the editor. */
export function readSelection(editor: HTMLElement): TextSelection | null {
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const offset = (node: Node, at: number) => {
    const before = editor.ownerDocument.createRange();
    before.setStart(editor, 0);
    before.setEnd(node, at);
    const fragment = document.createElement('div');
    fragment.append(before.cloneContents());
    // A cut-off fragment ends early, so its last break is a real one; the end is clamped.
    return Math.min(textLength(fragment, true), total);
  };
  const total = textLength(editor);
  return {
    start: offset(range.startContainer, range.startOffset),
    end: offset(range.endContainer, range.endOffset),
  };
}

/** Find the DOM point for a plain-text offset. */
export function pointAt(editor: HTMLElement, target: number): [Node, number] {
  let seen = 0;
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_ALL);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (target <= seen + length) return [node, target - seen];
      seen += length;
    } else if (
      node instanceof HTMLElement &&
      node.tagName === 'BR' &&
      !isPlaceholder(node) &&
      node !== lastLeaf(editor)
    ) {
      if (target <= seen) return [node.parentNode!, [...node.parentNode!.childNodes].indexOf(node)];
      seen += 1;
    }
  }
  const last = editor.lastChild;
  return last && isPlaceholder(last)
    ? [editor, editor.childNodes.length - 1]
    : [editor, editor.childNodes.length];
}

export function writeSelection(editor: HTMLElement, { start, end }: TextSelection) {
  const selection = editor.ownerDocument.getSelection();
  if (!selection) return;
  const range = editor.ownerDocument.createRange();
  range.setStart(...pointAt(editor, start));
  range.setEnd(...pointAt(editor, end));
  selection.removeAllRanges();
  selection.addRange(range);
}
