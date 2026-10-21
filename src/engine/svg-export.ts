import type { MindMap } from '../domain/model';
import { FONT_FAMILIES, nodeTypography } from '../domain/typography';
import { NODE_BORDER, NODE_PADDING_X } from '../domain/node-size';
import { DASHES, branchLine, nodeBackground, nodeBorder } from '../domain/node-colors';
import { MARKER_GAP, TASK_SIZE, nodeMarkers } from '../domain/node-markers';
import { connectionLines } from './connections';
import type { Layout } from './layout';

const MARGIN = 32;
export const CONNECTION_COLOR = '#8a63c2';
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
  const edges = layout.edges.map((edge) => {
    const line = branchLine(map.nodes, edge.to);
    const dash = DASHES[line.style] ? ` stroke-dasharray="${DASHES[line.style]}"` : '';
    return `<path d="${edge.path}" fill="none" stroke="${line.color ?? '#c4ccd0'}" stroke-width="2"${dash}/>`;
  });
  const links = connectionLines(map, layout).map(
    (link) =>
      `<path d="${link.path}" fill="none" stroke="${CONNECTION_COLOR}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#maplet-arrow)"/>`,
  );
  const nodes = layout.nodes.map((placed) => {
    const node = map.nodes[placed.id];
    const root = node.parentId === null;
    const typography = nodeTypography(node.style);
    const markers = nodeMarkers(node.style, typography.fontSize);
    const inset = NODE_BORDER + NODE_PADDING_X;
    const left = placed.x + inset + markers.width;
    const anchor = { left: 'start', center: 'middle', right: 'end' }[typography.textAlign];
    const x = {
      left,
      center: (left + placed.x + placed.width - inset) / 2,
      right: placed.x + placed.width - inset,
    }[typography.textAlign];
    const middle = placed.y + placed.height / 2;
    let markerX = placed.x + inset;
    const marks: string[] = [];
    if (markers.task) {
      const top = middle - TASK_SIZE / 2;
      marks.push(
        `<rect x="${markerX}" y="${top}" width="${TASK_SIZE}" height="${TASK_SIZE}" rx="4" fill="${markers.task === 'done' ? '#397760' : '#ffffff'}" stroke="#397760" stroke-width="1.5"/>`,
      );
      if (markers.task === 'done')
        marks.push(
          `<path d="M ${markerX + 4} ${middle} l 3 3 l 5 -6" fill="none" stroke="#ffffff" stroke-width="2"/>`,
        );
      markerX += TASK_SIZE + MARKER_GAP;
    }
    if (markers.icon)
      marks.push(
        `<text x="${markerX + markers.iconSize / 2}" y="${middle}" text-anchor="middle" dominant-baseline="central" font-size="${typography.fontSize}">${escape(markers.icon)}</text>`,
      );
    const top = placed.y + (placed.height - placed.lines.length * typography.lineHeight) / 2;
    const lines = placed.lines.map(
      (line, index) =>
        `<tspan x="${x}" y="${top + (index + 0.5) * typography.lineHeight}">${escape(line)}</tspan>`,
    );
    return [
      `<rect x="${placed.x + 0.5}" y="${placed.y + 0.5}" width="${placed.width - 1}" height="${placed.height - 1}" rx="8"`,
      ` fill="${nodeBackground(node.style, root)}" stroke="${nodeBorder(node.style) ?? (root ? '#9cab9f' : '#d1d9d5')}"/>`,
      ...marks,
      `<text text-anchor="${anchor}" dominant-baseline="central" fill="#25352d"`,
      ` font-family="${escape(FONT_FAMILIES[typography.fontFamily])}" font-size="${typography.fontSize}"`,
      ` font-weight="${typography.bold ? 700 : root ? 600 : 400}"`,
      `${typography.italic ? ' font-style="italic"' : ''} style="white-space:pre">${lines.join('')}</text>`,
    ].join('');
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`,
    `<defs><marker id="maplet-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${CONNECTION_COLOR}"/></marker></defs>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>`,
    ...edges,
    ...links,
    ...nodes,
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}
