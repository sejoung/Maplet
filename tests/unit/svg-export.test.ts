import { expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { addConnection } from '../../src/domain/connections';
import { layoutMap } from '../../src/engine/layout';
import { renderSvg } from '../../src/engine/svg-export';

it('draws every visible node and edge as standalone, escaped SVG', () => {
  let map = addNode(createMap('Root <&>'), 'root', 'a', 'Line one\nLine "two"');
  map = addNode(map, 'a', 'hidden', 'Collapsed child');
  map = updateNode(map, 'a', {
    collapsed: true,
    style: { background: '#fbf0db', textAlign: 'right' },
  });
  const layout = layoutMap(map);
  const { svg, width, height } = renderSvg(map, layout);
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(svg).toContain('Root &lt;&amp;&gt;');
  expect(svg).toContain('Line &quot;two&quot;');
  expect(svg).not.toContain('Collapsed child');
  expect(svg.match(/<tspan /g)).toHaveLength(3);
  expect(svg.match(/<path d="M [^"]*" fill="none" stroke="#c4ccd0"/g)).toHaveLength(
    layout.edges.length,
  );
  expect(svg).toContain('fill="#fbf0db"');
  expect(svg).toContain('text-anchor="end"');
  expect(svg).not.toMatch(/<script|on\w+=/i);
});

it('draws markers, emphasis, borders, branch lines and cross-links', () => {
  let map = addNode(createMap('Root'), 'root', 'a', 'Task');
  map = addNode(map, 'a', 'b', 'Child');
  map = addNode(map, 'root', 'c', 'Other');
  map = updateNode(map, 'a', {
    style: {
      task: 'done',
      icon: '⭐',
      fontWeight: 'bold',
      fontStyle: 'italic',
      borderColor: '#c0504d',
      branchColor: '#3b6fb6',
      lineStyle: 'dashed',
    },
  });
  map = addConnection(map, 'b', 'c');
  const { svg } = renderSvg(map, layoutMap(map));
  expect(svg).toContain('⭐');
  expect(svg).toContain('stroke="#c0504d"');
  expect(svg).toContain('font-weight="700"');
  expect(svg).toContain('font-style="italic"');
  // The branch color and dash reach the child's connector through inheritance.
  expect(svg.match(/stroke="#3b6fb6" stroke-width="2" stroke-dasharray="8 6"/g)).toHaveLength(2);
  expect(svg).toContain('marker-end="url(#maplet-arrow)"');
  // A completed task draws its check mark.
  expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ l 3 3 l 5 -6"/);
});
