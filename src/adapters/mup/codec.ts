import {
  MAX_TITLE,
  type Json,
  type JsonObject,
  type MindMap,
  type MindNode,
  type Side,
} from '../../domain/model';
import { isNodePosition } from '../../domain/positions';
import { cleanConnections } from '../../domain/connections';
import { AppError, formatCount } from '../../domain/errors';
import { isReservedId } from '../../domain/ids';
import { equalJson, isJsonObject } from '../../domain/json';
import { isValidRank, rankMagnitude } from '../../domain/ranks';
import {
  assertDepth,
  assertNodeCount,
  MAX_MUP_BYTES,
  readJson,
  safeLinks,
  UNSAFE_LINK_WARNING,
  type JsonErrors,
} from '../limits';

export const MUP_JSON: JsonErrors = {
  sizeKey: 'file.filesMustMibSmaller',
  jsonKey: 'file.invalidMupJson',
};
const objectOr = (value: Json | undefined): JsonObject => (isJsonObject(value) ? value : {});
const hyperlinks = (attr: JsonObject) =>
  typeof attr.hyperlink === 'string' ? [attr.hyperlink] : [];
/** Notes live in `attr.notes`, or in a plain-text attachment written by older MindMup. */
function readNotes(attr: JsonObject): string {
  if (typeof attr.notes === 'string') return attr.notes;
  const attachment = objectOr(attr.attachment);
  return attachment.contentType === 'text/plain' && typeof attachment.content === 'string'
    ? attachment.content
    : '';
}

/**
 * Where an idea keeps its look: version 1 on the idea itself with `collapsed` inside the
 * style, later versions in `attr`. Writes go to `idea` and `attr`, which the caller owns.
 */
function styleHost(idea: JsonObject, attr: JsonObject, version: number) {
  const host = version === 1 ? idea : attr;
  return {
    style: () => objectOr(host.style),
    collapsed: () => Boolean((version === 1 ? objectOr(host.style) : host).collapsed),
    setStyle: (style: JsonObject) => {
      host.style = style;
    },
    setCollapsed: (collapsed: boolean) => {
      if (version === 1) host.style = { ...objectOr(host.style), collapsed };
      else host.collapsed = collapsed;
    },
  };
}

export function parseMup(source: string): MindMap {
  return mupFromJson(readJson(source, MAX_MUP_BYTES, MUP_JSON), source);
}

/** Notices for MindMup features that are kept in the file but not shown. */
function collectWarnings(idea: JsonObject, attr: JsonObject, warnings: Set<string>) {
  const attachment = objectOr(attr.attachment);
  if (attachment.contentType && attachment.contentType !== 'text/plain')
    warnings.add('file.attachmentsPreserved');
  if (idea.resources || idea.icon || attr.icon) warnings.add('file.iconsResourcesPreserved');
  if (hyperlinks(attr).length && !safeLinks(hyperlinks(attr)).length)
    warnings.add(UNSAFE_LINK_WARNING);
}

/** Children sorted by rank; every key must be a valid rank. */
function rankedEntries(ideas: JsonObject, invalidKey: string, order: (rank: string) => number) {
  const entries = Object.entries(ideas);
  if (!entries.every(([rank]) => isValidRank(rank))) throw new AppError(invalidKey);
  return entries.sort(([a], [b]) => order(a) - order(b));
}

/** Convert an already parsed MindMup document; `source` is kept as the original backup. */
export function mupFromJson(raw: unknown, source: string): MindMap {
  if (!isJsonObject(raw)) throw new AppError('file.mindMapMustJsonObject');
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
    assertDepth(depth);
    assertNodeCount(++count);
    if (!isJsonObject(value) || seen.has(value))
      throw new AppError('file.invalidNodeCyclicReference');
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
    const attr = objectOr(value.attr);
    collectWarnings(value, attr, warnings);
    const look = styleHost(value, attr, version);
    // First-level branches take their side from the sign of their rank; deeper ones inherit.
    const side: Side =
      parentId && nodes[parentId].parentId === null
        ? Number(rank) < 0
          ? 'left'
          : 'right'
        : inheritedSide;
    const rawExtensions = { ...value };
    if (value.ideas === undefined) delete rawExtensions.ideas;
    else rawExtensions.ideas = {};
    const position = attr['maplet:position'];
    nodes[id] = {
      id,
      originalId: value.id,
      title: value.title,
      parentId,
      rank,
      side,
      children: [],
      collapsed: look.collapsed(),
      style: { ...look.style() },
      notes: readNotes(attr),
      links: safeLinks(hyperlinks(attr)),
      position: isNodePosition(position) ? { x: position.x, y: position.y } : null,
      rawExtensions,
    };
    if (value.ideas !== undefined) {
      if (!isJsonObject(value.ideas)) throw new AppError('file.ideasMustObjectContainingOrder');
      nodes[id].children = rankedEntries(
        value.ideas,
        'file.nodeRankMustFiniteNonzero',
        rankMagnitude,
      ).map(([key, child]) => visit(child, id, key, side, depth + 1));
    }
    return id;
  };
  let roots: string[];
  const extensions: JsonObject = version === 3 ? { ...raw } : {};
  if (version === 3) {
    if (!isJsonObject(raw.ideas) || !Object.keys(raw.ideas).length)
      throw new AppError('file.emptyMapNoCentralNode');
    roots = rankedEntries(raw.ideas, 'file.invalidRootRank', Number).map(([rank, child]) =>
      visit(child, null, rank, 'right', 1),
    );
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
    const links = raw.links.filter(isJsonObject).map((link) => ({
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
  const old = Array.isArray(previous) ? previous.filter(isJsonObject) : [];
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

// Writers change a field only when the model differs from what the file said, so untouched
// ideas export byte-for-byte the same JSON.

/** The position is Maplet's own attribute; other keys a tool added next to it stay. */
function writePosition(attr: JsonObject, position: MindNode['position']) {
  const previous = objectOr(attr['maplet:position']);
  if (position) attr['maplet:position'] = { ...previous, x: position.x, y: position.y };
  else if (isNodePosition(attr['maplet:position'])) {
    const remaining = { ...previous };
    delete remaining.x;
    delete remaining.y;
    if (Object.keys(remaining).length) attr['maplet:position'] = remaining;
    else delete attr['maplet:position'];
  }
}

function writeLook(look: ReturnType<typeof styleHost>, node: MindNode) {
  const before = { style: look.style(), collapsed: look.collapsed() };
  if (!equalJson(before.style, node.style)) look.setStyle({ ...node.style });
  if (before.collapsed !== node.collapsed) look.setCollapsed(node.collapsed);
}

function writeNotes(attr: JsonObject, notes: string) {
  if (readNotes(attr) === notes) return;
  attr.notes = notes;
  const attachment = objectOr(attr.attachment);
  if (attachment.contentType === 'text/plain') attr.attachment = { ...attachment, content: notes };
}

/** MindMup holds one hyperlink; an unsafe original stays unless the link was edited. */
function writeLinks(attr: JsonObject, links: readonly string[]) {
  if (equalJson(safeLinks(hyperlinks(attr)), links)) return;
  if (links[0]) attr.hyperlink = links[0];
  else delete attr.hyperlink;
}

function writeIdea(map: MindMap, id: string): JsonObject {
  const node = map.nodes[id];
  const idea = structuredClone(node.rawExtensions);
  idea.id = node.originalId;
  idea.title = node.title;
  const attr = { ...objectOr(idea.attr) };
  writePosition(attr, node.position);
  writeLook(styleHost(idea, attr, map.formatVersion), node);
  writeNotes(attr, node.notes);
  writeLinks(attr, node.links);
  if (Object.keys(attr).length || idea.attr !== undefined) idea.attr = attr;
  if (node.children.length || node.rawExtensions.ideas !== undefined)
    idea.ideas = Object.fromEntries(
      node.children.map((child) => [map.nodes[child].rank, writeIdea(map, child)]),
    );
  return idea;
}

export function serializeMup(map: MindMap): string {
  const raw =
    map.formatVersion === 3
      ? {
          ...map.rawExtensions,
          ideas: Object.fromEntries(
            map.roots.map((id) => [map.nodes[id].rank, writeIdea(map, id)]),
          ),
        }
      : writeIdea(map, map.roots[0]);
  if (map.connections) {
    const links = mupLinks(map, raw.links);
    if (links.length) raw.links = links;
    else delete raw.links;
  }
  if (map.formatVersion === 2) raw.formatVersion = 2;
  return JSON.stringify(raw, null, 2) + '\n';
}
