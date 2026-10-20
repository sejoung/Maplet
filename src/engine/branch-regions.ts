import type { LayoutNode } from './layout';

export const BRANCH_CLEARANCE = 24;
export const BRANCH_PADDING = BRANCH_CLEARANCE / 2;
export type BranchBounds = Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'>;
export interface BranchRegion extends BranchBounds {
  id: string;
  nodeIds: string[];
  kind: 'dragged' | 'displaced';
}

// The same padded envelope is used for collision detection and its visual guide.
export function branchBounds(nodes: BranchBounds[]): BranchBounds {
  const x = Math.min(...nodes.map((node) => node.x)) - BRANCH_PADDING;
  const y = Math.min(...nodes.map((node) => node.y)) - BRANCH_PADDING;
  return {
    x,
    y,
    width: Math.max(...nodes.map((node) => node.x + node.width)) + BRANCH_PADDING - x,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + BRANCH_PADDING - y,
  };
}
