import { expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
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
  expect(svg.match(/<path /g)).toHaveLength(layout.edges.length);
  expect(svg).toContain('fill="#fbf0db"');
  expect(svg).toContain('text-anchor="end"');
  expect(svg).not.toMatch(/<script|on\w+=/i);
});
