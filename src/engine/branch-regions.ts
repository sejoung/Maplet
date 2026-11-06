import { boundsOf, type Box } from './geometry';

export const BRANCH_CLEARANCE = 24;
export const BRANCH_PADDING = BRANCH_CLEARANCE / 2;
export type BranchBounds = Box;
export interface BranchRegion extends BranchBounds {
  id: string;
  nodeIds: string[];
  kind: 'dragged' | 'displaced';
}

// The same padded envelope is used for collision detection and its visual guide.
export const branchBounds = (nodes: readonly Box[]): BranchBounds =>
  boundsOf(nodes, BRANCH_PADDING);
