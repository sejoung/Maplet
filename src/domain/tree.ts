/**
 * Walks over the parent/child links that maps and clipboard fragments share. Lookups never
 * throw: a missing node ends a walk, so callers validate IDs where an error is wanted.
 */
export interface TreeNode {
  parentId: string | null;
  children: readonly string[];
}
export interface Tree<N extends TreeNode = TreeNode> {
  nodes: Record<string, N>;
}

/**
 * `id`, its parent, grandparent… up to a root. A missing node ends the chain after itself.
 * The chain is lazy, so code repairing damaged (merged) trees can stop at a cycle.
 */
export function* lineage(tree: Tree, id: string | null): Generator<string, void, undefined> {
  for (let key = id; key !== null; key = tree.nodes[key].parentId) {
    yield key;
    if (!Object.hasOwn(tree.nodes, key)) return;
  }
}

/** The nodes above `id`, nearest first. */
export const ancestors = (tree: Tree, id: string): string[] => [...lineage(tree, id)].slice(1);

/** Roots are at depth 1. */
export const depthOf = (tree: Tree, id: string): number => ancestors(tree, id).length + 1;

export const isDescendant = (tree: Tree, ancestor: string, candidate: string): boolean =>
  ancestors(tree, candidate).includes(ancestor);

/** The child of a root that holds `id`; a root is its own top branch. */
export const topBranch = (tree: Tree, id: string): string => [...lineage(tree, id)].at(-2) ?? id;

/** `id` and every node below it, parents before children, skipping branches in `skip`. */
export function subtreeIds(tree: Tree, id: string, skip?: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const visit = (key: string) => {
    if (skip?.has(key)) return;
    result.push(key);
    tree.nodes[key].children.forEach(visit);
  };
  visit(id);
  return result;
}

/** Levels in the branch under `id`, counting `id` itself. */
export const subtreeHeight = (tree: Tree, id: string): number =>
  1 + Math.max(0, ...tree.nodes[id].children.map((child) => subtreeHeight(tree, child)));
