import type { MindMap, MindNode } from '../domain/model';
import { FONT_FAMILIES, nodeTypography, type NodeTypography } from '../domain/style/typography';
import {
  LINE_COLORS,
  NODE_BACKGROUND,
  branchLine,
  nodeBackground,
  nodeBorder,
} from '../domain/style/node-colors';
import { connectionLines } from './connections';
import { boundsOf } from './geometry';
import type { Layout, LayoutNode } from './layout/layout';
import {
  DASHES,
  HIGHLIGHT_FILLS,
  MARKER_GAP,
  NODE_BORDER,
  NODE_PADDING_X,
  NODE_TEXT,
  TASK_SIZE,
  markerMetrics,
} from './render-metrics';

const MARGIN = 32;
export const CONNECTION_COLOR = '#8a63c2';
/** The canvas' default branch line and node borders in the light theme. */
const EDGE_COLOR = '#c4ccd0';
const ROOT_BORDER = '#9cab9f';
const NODE_BORDER_COLOR = '#d1d9d5';
const TASK_COLOR = LINE_COLORS[0];
/** Exports are drawn on white, like the default node background. */
const PAPER = NODE_BACKGROUND;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/** Where a node's text sits: its anchor, x and the top of its first line. */
interface TextFrame {
  typography: NodeTypography;
  anchor: string;
  x: number;
  top: number;
}

/** Task box and icon, left of the text and centered on the node. */
function renderMarkers(node: MindNode, placed: LayoutNode, typography: NodeTypography) {
  const markers = markerMetrics(node.style, typography.fontSize);
  const middle = placed.y + placed.height / 2;
  let x = placed.x + NODE_BORDER + NODE_PADDING_X;
  const marks: string[] = [];
  if (markers.task) {
    const top = middle - TASK_SIZE / 2;
    const done = markers.task === 'done';
    marks.push(
      `<rect x="${x}" y="${top}" width="${TASK_SIZE}" height="${TASK_SIZE}" rx="4" fill="${done ? TASK_COLOR : PAPER}" stroke="${TASK_COLOR}" stroke-width="1.5"/>`,
    );
    if (done)
      marks.push(
        `<path d="M ${x + 4} ${middle} l 3 3 l 5 -6" fill="none" stroke="${PAPER}" stroke-width="2"/>`,
      );
    x += TASK_SIZE + MARKER_GAP;
  }
  if (markers.icon)
    marks.push(
      `<text x="${x + markers.iconSize / 2}" y="${middle}" text-anchor="middle" dominant-baseline="central" font-size="${typography.fontSize}">${escape(markers.icon)}</text>`,
    );
  return { marks, width: markers.width };
}

// Text has no background in SVG; highlighter boxes are drawn behind each line instead.
function renderHighlights(placed: LayoutNode, { typography, x, top }: TextFrame) {
  return placed.runs.flatMap((runs, index) => {
    const lineWidth = runs.reduce((sum, run) => sum + run.width, 0);
    let runX = { left: x, center: x - lineWidth / 2, right: x - lineWidth }[typography.textAlign];
    return runs.flatMap((run) => {
      const box = run.highlight
        ? [
            `<rect x="${runX}" y="${top + index * typography.lineHeight}" width="${run.width}" height="${typography.lineHeight}" rx="3" fill="${HIGHLIGHT_FILLS[run.highlight]}"/>`,
          ]
        : [];
      runX += run.width;
      return box;
    });
  });
}

function renderText(placed: LayoutNode, root: boolean, { typography, anchor, x, top }: TextFrame) {
  const lines = placed.runs.map((runs, index) => {
    const y = top + (index + 0.5) * typography.lineHeight;
    const at = `x="${x}" y="${y}"`;
    if (!runs.length) return `<tspan ${at}></tspan>`;
    // Later runs continue the first one, so the whole line keeps its alignment anchor.
    return runs
      .map(
        (run, part) =>
          `<tspan${part ? '' : ` ${at}`}${run.bold ? ` font-weight="${typography.bold || root ? 800 : 700}"` : ''}${run.italic ? ' font-style="italic"' : ''}>${escape(run.hanging ? run.text.slice(0, -run.hanging) : run.text)}</tspan>`,
      )
      .join('');
  });
  return [
    `<text text-anchor="${anchor}" dominant-baseline="central" fill="${NODE_TEXT}"`,
    ` font-family="${escape(FONT_FAMILIES[typography.fontFamily])}" font-size="${typography.fontSize}"`,
    ` font-weight="${typography.bold ? 700 : root ? 600 : 400}"`,
    `${typography.italic ? ' font-style="italic"' : ''} style="white-space:pre">${lines.join('')}</text>`,
  ].join('');
}

function renderNode(map: MindMap, placed: LayoutNode) {
  const node = map.nodes[placed.id];
  const root = node.parentId === null;
  const typography = nodeTypography(node.style);
  const markers = renderMarkers(node, placed, typography);
  const inset = NODE_BORDER + NODE_PADDING_X;
  const left = placed.x + inset + markers.width;
  const frame: TextFrame = {
    typography,
    anchor: { left: 'start', center: 'middle', right: 'end' }[typography.textAlign],
    x: {
      left,
      center: (left + placed.x + placed.width - inset) / 2,
      right: placed.x + placed.width - inset,
    }[typography.textAlign],
    top: placed.y + (placed.height - placed.lines.length * typography.lineHeight) / 2,
  };
  return [
    `<rect x="${placed.x + 0.5}" y="${placed.y + 0.5}" width="${placed.width - 1}" height="${placed.height - 1}" rx="8"`,
    ` fill="${nodeBackground(node.style, root)}" stroke="${nodeBorder(node.style) ?? (root ? ROOT_BORDER : NODE_BORDER_COLOR)}"/>`,
    ...markers.marks,
    ...renderHighlights(placed, frame),
    renderText(placed, root, frame),
  ].join('');
}

/** Draw the visible layout as a standalone SVG matching the canvas styling. */
export function renderSvg(map: MindMap, layout: Layout) {
  const bounds = boundsOf(layout.nodes, MARGIN);
  const { x: minX, y: minY } = bounds;
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  const edges = layout.edges.map((edge) => {
    const line = branchLine(map, edge.to);
    const dash = DASHES[line.style] ? ` stroke-dasharray="${DASHES[line.style]}"` : '';
    return `<path d="${edge.path}" fill="none" stroke="${line.color ?? EDGE_COLOR}" stroke-width="2"${dash}/>`;
  });
  const links = connectionLines(map, layout).map(
    (link) =>
      `<path d="${link.path}" fill="none" stroke="${CONNECTION_COLOR}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#maplet-arrow)"/>`,
  );
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`,
    `<defs><marker id="maplet-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${CONNECTION_COLOR}"/></marker></defs>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${PAPER}"/>`,
    ...edges,
    ...links,
    ...layout.nodes.map((placed) => renderNode(map, placed)),
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}
