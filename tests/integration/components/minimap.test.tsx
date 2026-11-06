// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Minimap } from '../../../src/components/canvas/view/Minimap';
import { addNode, createMap, updateNode } from '../../../src/domain/commands';
import { addConnection } from '../../../src/domain/commands/connections';
import { layoutMap } from '../../../src/engine/layout/layout';
import { estimateTextWidth } from '../../../src/engine/layout/node-measure';
import * as connections from '../../../src/engine/connections';

function sample() {
  let map = createMap('Center');
  const root = map.roots[0];
  map = addNode(map, root, 'a', 'Plan');
  map = addNode(map, root, 'b', 'Build');
  map = addNode(map, 'a', 'a1', 'Research');
  map = updateNode(map, 'a', { style: { background: '#fbe9c8', borderColor: '#3b6fb6' } });
  map = updateNode(map, 'b', { style: { branchColor: '#c0504d' } });
  map = addConnection(map, 'a1', 'b');
  return { map, root, layout: layoutMap(map, estimateTextWidth) };
}
const view = { x: 0, y: 0, zoom: 1 };
/** One spelling for a color, since jsdom keeps SVG colors as written but HTML ones as rgb(). */
function color(value: string) {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}
const size = { width: 400, height: 300 };

it('draws the real map: connectors, cross-links and every node in its colors', () => {
  const { map, root, layout } = sample();
  const { container } = render(
    <Minimap
      map={map}
      layout={layout}
      view={view}
      size={size}
      selection={['b']}
      matches={new Set(['a1'])}
      onCenter={() => {}}
    />,
  );
  const edges = container.querySelectorAll('.minimap-edge');
  expect(edges).toHaveLength(layout.edges.length);
  expect([...edges].map((edge) => edge.getAttribute('d'))).toEqual(
    layout.edges.map((edge) => edge.path),
  );
  // The branch color of `b` colors its connector, as on the canvas.
  const strokes = [...edges].map((edge) => (edge as SVGElement).style.stroke);
  expect(strokes.map(color)).toContain(color('#c0504d'));
  expect(container.querySelectorAll('.minimap-link')).toHaveLength(1);
  const node = (id: string) =>
    container.querySelector<SVGRectElement>(`[data-minimap-node="${id}"]`)!;
  expect(container.querySelectorAll('.minimap-node')).toHaveLength(4);
  expect(node(root).classList.contains('root')).toBe(true);
  expect(color(node('a').style.fill)).toBe(color('#fbe9c8'));
  expect(color(node('a').style.stroke)).toBe(color('#3b6fb6'));
  expect(node('b').classList.contains('selected')).toBe(true);
  expect(node('a1').classList.contains('match')).toBe(true);
});

it('moves only the viewport frame while panning', () => {
  const { map, layout } = sample();
  const lines = vi.spyOn(connections, 'connectionLines');
  const props = { map, layout, size, selection: [], onCenter: () => {} };
  const { container, rerender } = render(<Minimap {...props} view={view} />);
  const frame = () => container.querySelector('.minimap-view')!.getAttribute('x');
  const before = frame();
  expect(lines).toHaveBeenCalledTimes(1);
  rerender(<Minimap {...props} view={{ ...view, x: -200 }} />);
  expect(frame()).not.toBe(before);
  // The drawing is memoized on the map, so a pan does not redraw it.
  expect(lines).toHaveBeenCalledTimes(1);
});
