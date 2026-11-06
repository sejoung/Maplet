import type { MindNode } from '../../../domain/model';
import { FONT_FAMILIES, nodeTypography } from '../../../domain/style/typography';

let probe: HTMLSpanElement | null = null;
let activeFont = '';
const widths = new Map<string, number>();

export function measureNodeText(
  text: string,
  node: MindNode,
  inline: { bold?: boolean; italic?: boolean } = {},
): number {
  const { fontSize, fontFamily, bold, italic } = nodeTypography(node.style);
  const base = bold ? 700 : node.parentId === null ? 600 : 400;
  // Inline bold has to stand out from an already heavy root or bold node.
  const weight = inline.bold ? (base > 400 ? 800 : 700) : base;
  const slant = italic || inline.italic ? 'italic ' : '';
  const font = `${slant}${weight} ${fontSize}px ${FONT_FAMILIES[fontFamily]}`;
  const key = `${font}\n${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      left: '0',
      top: '0',
      whiteSpace: 'pre',
      width: 'max-content',
      contain: 'layout style paint',
      fontKerning: 'normal',
      tabSize: '1',
    });
    document.body.append(probe);
  }
  if (activeFont !== font) {
    probe.style.font = font;
    activeFont = font;
  }
  // Use the same shaping and glyph rounding as HTML text and the inline textarea.
  probe.textContent = text;
  const width = probe.getBoundingClientRect().width;
  if (widths.size >= 4096) widths.clear();
  widths.set(key, width);
  return width;
}

export function clearTextMeasurements() {
  widths.clear();
}
