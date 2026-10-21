import type { MindMap } from '../domain/model';
import { DASHES, branchLine } from '../domain/node-colors';
import { connectionLines } from '../engine/connections';
import type { Layout } from '../engine/layout';

/** Hierarchy connectors, colored and dashed per branch, and cross-links drawn as arrows. */
export function CanvasLines({ map, layout }: { map: MindMap; layout: Layout }) {
  return (
    <svg className="connections" width={layout.width} height={layout.height} aria-hidden="true">
      <defs>
        <marker
          id="cross-link-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="cross-link-head" />
        </marker>
      </defs>
      {layout.edges.map((edge) => {
        const line = branchLine(map.nodes, edge.to);
        return (
          <path
            key={edge.to}
            className="edge"
            data-edge-to={edge.to}
            data-edge-from={edge.from}
            d={edge.path}
            style={line.color ? { stroke: line.color } : undefined}
            strokeDasharray={DASHES[line.style]}
            fill="none"
            strokeWidth="2"
          />
        );
      })}
      {connectionLines(map, layout).map((link) => (
        <path
          key={`${link.from}>${link.to}`}
          className="cross-link"
          data-link-from={link.from}
          data-link-to={link.to}
          d={link.path}
          fill="none"
          strokeWidth="2"
          strokeDasharray="6 4"
          markerEnd="url(#cross-link-arrow)"
        />
      ))}
    </svg>
  );
}
