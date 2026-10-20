import type { BranchRegion } from '../engine/branch-regions';

export function BranchRegions({ regions }: { regions?: BranchRegion[] }) {
  return regions?.map(({ id, kind, nodeIds, x, y, width, height }) => (
    <div
      key={id}
      aria-hidden="true"
      className={`branch-region ${kind}`}
      data-branch-region={id}
      data-region-kind={kind}
      data-region-nodes={JSON.stringify(nodeIds)}
      style={{ left: x, top: y, width, height }}
    />
  ));
}
