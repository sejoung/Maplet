import type { MindMap } from '../domain/model';
import { FONT_FAMILIES, nodeTypography } from '../domain/typography';
import { NODE_BORDER, NODE_PADDING_X } from '../domain/node-size';
import { nodeBackground } from '../domain/node-colors';
import type { Layout } from './layout';

const MARGIN = 32;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/** Draw the visible layout as a standalone SVG matching the canvas styling. */
export function renderSvg(map: MindMap, layout: Layout) {
  const minX = Math.min(...layout.nodes.map((node) => node.x)) - MARGIN;
  const minY = Math.min(...layout.nodes.map((node) => node.y)) - MARGIN;
  const width = Math.ceil(
    Math.max(...layout.nodes.map((node) => node.x + node.width)) + MARGIN - minX,
  );
  const height = Math.ceil(
    Math.max(...layout.nodes.map((node) => node.y + node.height)) + MARGIN - minY,
  );
  const edges = layout.edges.map(
    (edge) => `<path d="${edge.path}" fill="none" stroke="#c4ccd0" stroke-width="2"/>`,
  );
  const nodes = layout.nodes.map((placed) => {
    const node = map.nodes[placed.id];
    const root = node.parentId === null;
    const typography = nodeTypography(node.style);
    const inset = NODE_BORDER + NODE_PADDING_X;
    const anchor = { left: 'start', center: 'middle', right: 'end' }[typography.textAlign];
    const x = {
      left: placed.x + inset,
      center: placed.x + placed.width / 2,
      right: placed.x + placed.width - inset,
    }[typography.textAlign];
    const top = placed.y + (placed.height - placed.lines.length * typography.lineHeight) / 2;
    const lines = placed.lines.map(
      (line, index) =>
        `<tspan x="${x}" y="${top + (index + 0.5) * typography.lineHeight}">${escape(line)}</tspan>`,
    );
    return [
      `<rect x="${placed.x + 0.5}" y="${placed.y + 0.5}" width="${placed.width - 1}" height="${placed.height - 1}" rx="8"`,
      ` fill="${nodeBackground(node.style, root)}" stroke="${root ? '#9cab9f' : '#d1d9d5'}"/>`,
      `<text text-anchor="${anchor}" dominant-baseline="central" fill="#25352d"`,
      ` font-family="${escape(FONT_FAMILIES[typography.fontFamily])}" font-size="${typography.fontSize}"`,
      ` font-weight="${root ? 600 : 400}" style="white-space:pre">${lines.join('')}</text>`,
    ].join('');
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>`,
    ...edges,
    ...nodes,
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}
