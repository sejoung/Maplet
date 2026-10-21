import {
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type MindMap,
  type MindNode,
} from '../../domain/model';
import { safeUrl } from '../../domain/commands';
import { AppError, formatCount } from '../../domain/errors';
import { signedRank } from '../../domain/ranks';
import { assertSize, MAX_MUP_BYTES, utf8Length } from '../limits';

/** Markdown, OPML and plain text outlines open as new maps. */
export const isOutlineName = (name: string) => /\.(md|markdown|opml|txt)$/i.test(name);

interface Item {
  /** Larger is deeper; only the order matters. */
  level: number;
  title: string;
  notes: string[];
  link: string | null;
}

/** Turn an ordered outline into a map; several top-level items share a root named `title`. */
function buildMap(items: Item[], title: string): MindMap {
  if (!items.length) throw new AppError('file.nothingToImport');
  const nodes: Record<string, MindNode> = {};
  const node = (
    id: string,
    item: Pick<Item, 'title' | 'notes' | 'link'>,
    parentId: string | null,
  ) =>
    (nodes[id] = {
      id,
      originalId: id,
      title: item.title.slice(0, MAX_TITLE) || ' ',
      children: [],
      parentId,
      rank: '1',
      side: 'right',
      collapsed: false,
      style: {},
      notes: item.notes.join('\n').trim(),
      links: item.link && safeUrl(item.link) ? [item.link] : [],
      position: null,
      rawExtensions: {},
    });
  const minimum = Math.min(...items.map((item) => item.level));
  const tops = items.filter((item) => item.level === minimum).length;
  const wrap = tops > 1 || items[0].level !== minimum;
  if (items.length + (wrap ? 1 : 0) > MAX_NODE_COUNT)
    throw new AppError('file.mapMustHaveMostNodes', { max: formatCount(MAX_NODE_COUNT) });
  const stack: { level: number; id: string }[] = [];
  if (wrap) {
    node('root', { title, notes: [], link: null }, null);
    stack.push({ level: -Infinity, id: 'root' });
  }
  items.forEach((item, index) => {
    while (stack.length && stack.at(-1)!.level >= item.level) stack.pop();
    if (stack.length >= MAX_DEPTH) throw new AppError('file.nodeDepthMustLess', { max: MAX_DEPTH });
    const parent = stack.at(-1)?.id ?? null;
    const id = `n${index + 1}`;
    node(id, item, parent);
    if (parent) {
      nodes[parent].children.push(id);
      nodes[id].rank = signedRank(nodes[parent].children.length, 'right');
    }
    stack.push({ level: item.level, id });
  });
  const roots = wrap ? ['root'] : ['n1'];
  return { formatVersion: 2, roots, nodes, rawExtensions: {}, original: null, warnings: [] };
}

const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const bullet = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const linked = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** Headings and nested lists become branches; other text becomes the previous item's notes. */
export function markdownToMap(text: string, title: string): MindMap {
  const items: Item[] = [];
  let section = 0;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const head = heading.exec(line);
    const item = bullet.exec(line);
    let entry: Item | null = null;
    if (head) {
      section = head[1].length * 1000;
      entry = { level: section, title: head[2], notes: [], link: null };
    } else if (item) {
      entry = {
        level: section + 1 + indentOf(item[1]),
        title: item[2].trim(),
        notes: [],
        link: null,
      };
    } else if (line.trim() && items.length) items.at(-1)!.notes.push(line.trim());
    if (!entry) continue;
    const match = linked.exec(entry.title);
    if (match) [entry.title, entry.link] = [match[1], match[2]];
    if (entry.title) items.push(entry);
  }
  return buildMap(items, title);
}

const inline = (title: string) => title.replace(/\s*\n\s*/g, ' ');

/** Roots as headings, descendants as nested lists, notes as indented paragraphs. */
export function mapToMarkdown(map: MindMap): string {
  const lines: string[] = [];
  const label = (node: MindNode) =>
    node.links[0] ? `[${inline(node.title)}](${node.links[0]})` : inline(node.title);
  const notes = (node: MindNode, indent: string) => {
    if (node.notes) lines.push('', ...node.notes.split('\n').map((line) => indent + line), '');
  };
  const visit = (id: string, depth: number) => {
    const node = map.nodes[id];
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- ${label(node)}`);
    notes(node, indent + '  ');
    node.children.forEach((child) => visit(child, depth + 1));
  };
  map.roots.forEach((id, index) => {
    const root = map.nodes[id];
    if (index) lines.push('');
    lines.push(`# ${label(root)}`, '');
    if (root.notes) lines.push(root.notes, '');
    root.children.forEach((child) => visit(child, 0));
  });
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

const attribute = (text: string) =>
  text.replace(
    /[&<>"\n]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\n': '&#10;' })[char]!,
  );

/** OPML 2.0 with notes in the common `_note` attribute and links in `url`. */
export function mapToOpml(map: MindMap, title: string): string {
  const visit = (id: string, depth: number): string => {
    const node = map.nodes[id];
    const indent = '  '.repeat(depth + 2);
    const attributes = [
      `text="${attribute(node.title)}"`,
      node.notes && `_note="${attribute(node.notes)}"`,
      node.links[0] && `url="${attribute(node.links[0])}"`,
    ].filter(Boolean);
    const open = `${indent}<outline ${attributes.join(' ')}`;
    if (!node.children.length) return `${open}/>`;
    return [
      `${open}>`,
      ...node.children.map((child) => visit(child, depth + 1)),
      `${indent}</outline>`,
    ].join('\n');
  };
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${attribute(title)}</title></head>`,
    '  <body>',
    ...map.roots.map((id) => visit(id, 0)),
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}

export function opmlToMap(text: string, title: string): MindMap {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const body = document.querySelector('opml > body');
  if (document.querySelector('parsererror') || !body) throw new AppError('file.notValidOpmlFile');
  const items: Item[] = [];
  const visit = (element: Element, level: number) => {
    for (const child of element.children) {
      if (child.tagName !== 'outline') continue;
      if (items.length >= MAX_NODE_COUNT)
        throw new AppError('file.mapMustHaveMostNodes', { max: formatCount(MAX_NODE_COUNT) });
      items.push({
        level,
        title: child.getAttribute('text') ?? child.getAttribute('title') ?? '',
        notes: [child.getAttribute('_note') ?? ''],
        link: child.getAttribute('url') ?? child.getAttribute('htmlUrl'),
      });
      visit(child, level + 1);
    }
  };
  visit(body, 0);
  const named = document.querySelector('opml > head > title')?.textContent?.trim();
  return buildMap(items, named || title);
}

const indentOf = (line: string) =>
  [...line.match(/^[\t ]*/)![0]].reduce((sum, char) => sum + (char === '\t' ? 4 : 1), 0);

/** Plain text: every non-empty line is an item, nested by its indentation. */
export function textToMap(text: string, title: string): MindMap {
  const items = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      level: indentOf(line),
      title: line.trim().replace(/^(?:[-*+•▪◦]|\d+[.)])\s+/, ''),
      notes: [],
      link: null,
    }));
  return buildMap(items, title);
}

/** Parse an outline file by its extension; `title` names a root added for several top items. */
export function parseOutline(source: string, name: string, title: string): MindMap {
  assertSize(utf8Length(source), MAX_MUP_BYTES);
  if (/\.opml$/i.test(name)) return opmlToMap(source, title);
  return /\.txt$/i.test(name) ? textToMap(source, title) : markdownToMap(source, title);
}
