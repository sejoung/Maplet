import type { MindMap, MindNode } from './model';
import { nextRank, placeRank } from './ranks';
import { subtreeIds } from './tree';

/**
 * Copy-on-write edits of a map's nodes. The first change copies the node record and every
 * change copies only its node, so untouched nodes stay shared with the input (and with undo
 * history) and edits that change nothing hand back the input map itself. Commands must never
 * write to nodes they read: shared nodes belong to earlier history entries too.
 */
export interface NodeEdits {
  /** The nodes as edited so far. */
  readonly nodes: Readonly<Record<string, MindNode>>;
  /** Merge `values` into a node; values identical to the current ones change nothing. */
  set(id: string, values: Partial<MindNode>): void;
  add(node: MindNode): void;
  remove(id: string): void;
  /** The edited map with `changes`, or `map` itself when nothing changed. */
  done(changes?: Partial<Omit<MindMap, 'nodes'>>): MindMap;
}

export function editNodes(map: MindMap): NodeEdits {
  let nodes = map.nodes;
  const writable = () => (nodes === map.nodes ? (nodes = { ...nodes }) : nodes);
  return {
    get nodes() {
      return nodes;
    },
    set(id, values) {
      const node = nodes[id];
      if (
        Object.entries(values).every(([key, value]) =>
          Object.is(node[key as keyof MindNode], value),
        )
      )
        return;
      writable()[id] = { ...node, ...values };
    },
    add(node) {
      writable()[node.id] = node;
    },
    remove(id) {
      delete writable()[id];
    },
    done(changes = {}) {
      return nodes === map.nodes && !Object.keys(changes).length
        ? map
        : { ...map, ...changes, nodes };
    },
  };
}

export function applyRanks(edits: NodeEdits, ranks: Record<string, string>) {
  for (const [id, rank] of Object.entries(ranks)) edits.set(id, { rank });
}

/**
 * Splice `id`, already among the edited nodes, under `parentId` after `afterId` (or last),
 * rank it among its new siblings and expand the parent so it shows.
 */
export function attachChild(edits: NodeEdits, parentId: string, id: string, afterId?: string) {
  const siblings = edits.nodes[parentId].children;
  const index = afterId ? siblings.indexOf(afterId) + 1 : siblings.length;
  const children = [...siblings.slice(0, index), id, ...siblings.slice(index)];
  edits.set(id, { parentId, rank: nextRank(edits, siblings, edits.nodes[id].side) });
  edits.set(parentId, { children, collapsed: false });
  if (afterId) applyRanks(edits, placeRank(edits, children, id));
}

/** Put a whole branch on `side`, releasing manual positions so it follows the layout there. */
export function placeBranch(edits: NodeEdits, id: string, side: MindNode['side']) {
  for (const key of subtreeIds(edits, id)) edits.set(key, { side, position: null });
}
