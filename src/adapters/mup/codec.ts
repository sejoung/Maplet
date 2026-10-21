import {
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type Json,
  type JsonObject,
  type MindMap,
  type MindNode,
  type Side,
} from '../../domain/model';
import { isNodePosition } from '../../domain/positions';
import { cleanConnections } from '../../domain/connections';
import { safeUrl } from '../../domain/commands';
import { AppError, formatCount } from '../../domain/errors';
import { isReservedId } from '../../domain/ids';
import { equalJson, isJsonObject, parseFiniteJson } from '../../domain/json';
import { rankMagnitude } from '../../domain/ranks';
import { assertSize, MAX_MUP_BYTES, utf8Length } from '../limits';
import { UNSAFE_LINK_WARNING } from '../maplet/codec';

export const MAX_BYTES = MAX_MUP_BYTES;
export const MAX_NODES = MAX_NODE_COUNT;
const object = isJsonObject;
const obj = (value: Json | undefined): JsonObject => (object(value) ? value : {});
const validRank = (rank: string) =>
  rank.trim() !== '' && Number.isFinite(Number(rank)) && Number(rank) !== 0;
/** Only openable links enter the model; the raw hyperlink stays in the preserved source. */
const safeLinks = (attr: JsonObject) =>
  typeof attr.hyperlink === 'string' && safeUrl(attr.hyperlink) ? [attr.hyperlink] : [];

export const MUP_JSON_ERROR = 'file.invalidMupJson';

export function parseMup(source: string): MindMap {
  assertSize(utf8Length(source), MAX_BYTES);
  let raw: unknown;
  try {
    raw = parseFiniteJson(source);
  } catch {
    throw new AppError(MUP_JSON_ERROR);
  }
  return mupFromJson(raw, source);
}

/** Convert an already parsed MindMup document; `source` is kept as the original backup. */
export function mupFromJson(raw: unknown, source: string): MindMap {
  if (!object(raw)) throw new AppError('file.mindMapMustJsonObject');
  const version = raw.formatVersion ?? 1;
  if (version !== 1 && version !== 2 && version !== 3)
    throw new AppError('file.unsupportedMupVersion');
  const nodes: Record<string, MindNode> = {};
  const warnings = new Set<string>();
  const seen = new Set<object>();
  let count = 0;
  const visit = (
    value: Json,
    parentId: string | null,
    rank: string,
    inheritedSide: Side,
    depth: number,
  ): string => {
    if (depth > MAX_DEPTH) throw new AppError('file.nodeDepthMustLess', { max: MAX_DEPTH });
    if (++count > MAX_NODES)
      throw new AppError('file.mapMustHaveMostNodes', { max: formatCount(MAX_NODES) });
    if (!object(value) || seen.has(value)) throw new AppError('file.invalidNodeCyclicReference');
    seen.add(value);
    if (
      (typeof value.id !== 'number' && typeof value.id !== 'string') ||
      String(value.id).length === 0 ||
      typeof value.title !== 'string'
    )
      throw new AppError('file.everyNodeNeedsIdText');
    const id = String(value.id);
    if (isReservedId(id) || Object.hasOwn(nodes, id))
      throw new AppError('common.duplicateInvalidNodeId');
    if (value.title.length > MAX_TITLE)
      throw new AppError('file.nodeTitlesMustCharactersShorter', { max: formatCount(MAX_TITLE) });
    const attr = obj(value.attr);
    const style = version === 1 ? obj(value.style) : obj(attr.style);
    const attachment = obj(attr.attachment);
    if (attachment.contentType && attachment.contentType !== 'text/plain')
      warnings.add('file.attachmentsPreserved');
    if (value.resources || value.icon || attr.icon) warnings.add('file.iconsResourcesPreserved');
    const links = safeLinks(attr);
    if (typeof attr.hyperlink === 'string' && !links.length) warnings.add(UNSAFE_LINK_WARNING);
    const side =
      parentId && nodes[parentId].parentId === null
        ? Number(rank) < 0
          ? 'left'
          : 'right'
        : inheritedSide;
    const rawExtensions = { ...value };
    if (value.ideas === undefined) delete rawExtensions.ideas;
    else rawExtensions.ideas = {};
    nodes[id] = {
      id,
      originalId: value.id as string | number,
      title: value.title,
      parentId,
      rank,
      side,
      children: [],
      collapsed: Boolean(version === 1 ? style.collapsed : attr.collapsed),
      style: { ...style },
      notes:
        typeof attr.notes === 'string'
          ? attr.notes
          : attachment.contentType === 'text/plain' && typeof attachment.content === 'string'
            ? attachment.content
            : '',
      links,
      position: isNodePosition(attr['maplet:position'])
        ? { x: attr['maplet:position'].x, y: attr['maplet:position'].y }
        : null,
      rawExtensions,
    };
    if (value.ideas !== undefined) {
      if (!object(value.ideas)) throw new AppError('file.ideasMustObjectContainingOrder');
      const entries = Object.entries(value.ideas);
      if (!entries.every(([key]) => validRank(key)))
        throw new AppError('file.nodeRankMustFiniteNonzero');
      entries.sort(([a], [b]) => rankMagnitude(a) - rankMagnitude(b));
      nodes[id].children = entries.map(([key, child]) => visit(child, id, key, side, depth + 1));
    }
    return id;
  };
  let roots: string[];
  const extensions: JsonObject = version === 3 ? { ...raw } : {};
  if (version === 3) {
    if (!object(raw.ideas) || !Object.keys(raw.ideas).length)
      throw new AppError('file.emptyMapNoCentralNode');
    const entries = Object.entries(raw.ideas);
    if (!entries.every(([rank]) => validRank(rank))) throw new AppError('file.invalidRootRank');
    roots = entries
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([rank, child]) => visit(child, null, rank, 'right', 1));
    delete extensions.ideas;
  } else roots = [visit(raw, null, '1', 'right', 1)];
  if (raw.resources) warnings.add('file.resourcesPreserved');
  const map: MindMap = {
    formatVersion: version,
    roots,
    nodes,
    rawExtensions: extensions,
    original: source,
    warnings: [...warnings],
  };
  // Version 3 keeps cross-links beside the roots; older versions on the root idea.
  if (Array.isArray(raw.links)) {
    const links = raw.links.filter(object).map((link) => ({
      from: String(link.ideaIdFrom),
      to: String(link.ideaIdTo),
    }));
    const connections = cleanConnections(map, links);
    if (connections.length < raw.links.length) warnings.add('file.danglingLinksPreserved');
    map.connections = connections;
    map.warnings = [...warnings];
  }
  return map;
}

/** Cross-links in MindMup form, keeping the attributes of links that still exist. */
function mupLinks(map: MindMap, previous: unknown): Json[] {
  const old = Array.isArray(previous) ? previous.filter(object) : [];
  return (map.connections ?? []).map(({ from, to }) => {
    const ideaIdFrom = map.nodes[from].originalId;
    const ideaIdTo = map.nodes[to].originalId;
    return (
      old.find(
        (link) =>
          String(link.ideaIdFrom) === String(ideaIdFrom) &&
          String(link.ideaIdTo) === String(ideaIdTo),
      ) ?? { ideaIdFrom, ideaIdTo }
    );
  });
}

export function serializeMup(map: MindMap): string {
  const visit = (id: string): JsonObject => {
    const node = map.nodes[id];
    const raw = structuredClone(node.rawExtensions);
    raw.id = node.originalId;
    raw.title = node.title;
    const attr = { ...obj(raw.attr) };
    if (node.position)
      attr['maplet:position'] = {
        ...obj(attr['maplet:position']),
        x: node.position.x,
        y: node.position.y,
      };
    else if (isNodePosition(attr['maplet:position'])) {
      const remaining = { ...obj(attr['maplet:position']) };
      delete remaining.x;
      delete remaining.y;
      if (Object.keys(remaining).length) attr['maplet:position'] = remaining;
      else delete attr['maplet:position'];
    }
    const originalStyle = map.formatVersion === 1 ? obj(raw.style) : obj(attr.style);
    const originalCollapsed = Boolean(
      map.formatVersion === 1 ? originalStyle.collapsed : attr.collapsed,
    );
    const style = { ...node.style };
    if (!equalJson(originalStyle, style)) {
      if (map.formatVersion === 1) raw.style = style;
      else attr.style = style;
    }
    if (originalCollapsed !== node.collapsed) {
      if (map.formatVersion === 1) raw.style = { ...obj(raw.style), collapsed: node.collapsed };
      else attr.collapsed = node.collapsed;
    }
    const originalAttachment = obj(attr.attachment);
    const originalNotes =
      typeof attr.notes === 'string'
        ? attr.notes
        : originalAttachment.contentType === 'text/plain'
          ? (originalAttachment.content ?? '')
          : '';
    if (originalNotes !== node.notes) {
      attr.notes = node.notes;
      if (originalAttachment.contentType === 'text/plain')
        attr.attachment = { ...originalAttachment, content: node.notes };
    }
    if (!equalJson(safeLinks(attr), node.links)) {
      if (node.links[0]) attr.hyperlink = node.links[0];
      else delete attr.hyperlink;
    }
    if (Object.keys(attr).length || raw.attr !== undefined) raw.attr = attr;
    if (node.children.length || node.rawExtensions.ideas !== undefined)
      raw.ideas = Object.fromEntries(
        node.children.map((child) => [map.nodes[child].rank, visit(child)]),
      );
    return raw;
  };
  const raw =
    map.formatVersion === 3
      ? {
          ...map.rawExtensions,
          ideas: Object.fromEntries(map.roots.map((id) => [map.nodes[id].rank, visit(id)])),
        }
      : visit(map.roots[0]);
  if (map.connections) {
    const links = mupLinks(map, raw.links);
    if (links.length) raw.links = links;
    else delete raw.links;
  }
  if (map.formatVersion === 2) raw.formatVersion = 2;
  return JSON.stringify(raw, null, 2) + '\n';
}
