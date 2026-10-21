import { describe, expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { nodeMarkers, TASK_SIZE, MARKER_GAP } from '../../src/domain/node-markers';
import { branchLine, nodeBorder } from '../../src/domain/node-colors';
import { measureNode } from '../../src/engine/node-measure';
import { layoutMap } from '../../src/engine/layout';
import { focusLayout } from '../../src/engine/focus';
import { connectionLines, connectionPath } from '../../src/engine/connections';
import { addConnection } from '../../src/domain/connections';
import { dropTargetAt } from '../../src/engine/branch-drag';

let map = addNode(createMap('Root'), 'root', 'a', 'Alpha');
map = addNode(map, 'a', 'a1', 'Alpha one');
map = addNode(map, 'a1', 'a2', 'Alpha two');
map = addNode(map, 'root', 'b', 'Beta');
map = addNode(map, 'root', 'c', 'Gamma');

describe('node markers and emphasis', () => {
  it('reserves room for a task box and a known icon only', () => {
    expect(nodeMarkers({}, 15).width).toBe(0);
    const both = nodeMarkers({ task: 'done', icon: '⭐' }, 20);
    expect(both).toMatchObject({ task: 'done', icon: '⭐', iconSize: 25 });
    expect(both.width).toBe(TASK_SIZE + MARKER_GAP + 25 + MARKER_GAP);
    expect(nodeMarkers({ task: 'later', icon: '<script>' }, 15)).toMatchObject({
      task: null,
      icon: null,
      width: 0,
    });
  });

  it('widens automatic nodes for markers and bold text, and wraps earlier at fixed widths', () => {
    const node = map.nodes.a;
    const plain = measureNode(node);
    expect(measureNode({ ...node, style: { task: 'todo' } }).width).toBe(
      plain.width + TASK_SIZE + MARKER_GAP,
    );
    expect(measureNode({ ...node, style: { fontWeight: 'bold' } }).width).toBeGreaterThan(
      plain.width,
    );
    const fixed = { ...node, title: 'A fairly long title here', style: { width: 120 } };
    expect(
      measureNode({ ...fixed, style: { width: 120, icon: '⭐' } }).lines.length,
    ).toBeGreaterThan(measureNode(fixed).lines.length);
  });

  it('inherits branch line color and style from the nearest styled ancestor', () => {
    let styled = updateNode(map, 'a', { style: { branchColor: '#3b6fb6' } });
    styled = updateNode(styled, 'a1', { style: { lineStyle: 'dotted', branchColor: 'red' } });
    expect(branchLine(styled.nodes, 'a')).toEqual({ color: '#3b6fb6', style: 'solid' });
    expect(branchLine(styled.nodes, 'a2')).toEqual({ color: '#3b6fb6', style: 'dotted' });
    expect(branchLine(styled.nodes, 'b')).toEqual({ color: null, style: 'solid' });
    expect(nodeBorder({ borderColor: '#c0504d' })).toBe('#c0504d');
    expect(nodeBorder({ borderColor: 'url(x)' })).toBeNull();
  });
});

describe('focus and cross-link geometry', () => {
  const layout = layoutMap(map);
  it('keeps only one branch at its usual coordinates', () => {
    const focused = focusLayout(map, layout, 'a');
    expect(focused.nodes.map((node) => node.id)).toEqual(['a', 'a1', 'a2']);
    expect(focused.nodes[0]).toEqual(layout.nodes.find((node) => node.id === 'a'));
    expect(focused.edges.map((edge) => edge.to)).toEqual(['a1', 'a2']);
  });

  it('draws visible links between box borders', () => {
    const linked = addConnection(addConnection(map, 'a2', 'c'), 'b', 'root');
    expect(connectionLines(linked, layout).map((line) => line.to)).toEqual(['c', 'root']);
    const hidden = updateNode(linked, 'a1', { collapsed: true });
    expect(connectionLines(hidden, layoutMap(hidden)).map((line) => line.to)).toEqual(['root']);
    const from = {
      id: 'x',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      lines: [],
      branch: 0,
      side: 'right' as const,
    };
    const to = { ...from, id: 'y', x: 300 };
    expect(connectionPath(from, to)).toMatch(/^M 100 20 Q [\d.]+ -?[\d.]+ 300 20$/);
  });
});

describe('dropping beside siblings', () => {
  const layout = layoutMap(map);
  const box = (id: string) => layout.nodes.find((node) => node.id === id)!;
  const probe = (id: string, dy: number) => ({ ...box(id), x: box(id).x, y: box(id).y + dy });

  it('inserts before or after a node approached from above or below', () => {
    // The first and last children have nothing else above or below them.
    const a = box('a'),
      c = box('c');
    expect(dropTargetAt(map, layout, ['b'], probe('a', -a.height - 6))).toEqual({
      id: 'root',
      side: 'right',
      node: 'a',
      place: 'before',
    });
    expect(dropTargetAt(map, layout, ['a2'], probe('c', c.height + 6))).toMatchObject({
      node: 'c',
      place: 'after',
    });
    const b = box('b');
    // Reordering under the same parent is allowed beside a sibling.
    expect(dropTargetAt(map, layout, ['c'], probe('a', -a.height - 6))).toMatchObject({
      id: 'root',
      node: 'a',
      place: 'before',
    });
    // Beside a node horizontally still makes it the parent.
    expect(dropTargetAt(map, layout, ['a2'], { ...b, x: b.x + b.width + 6 })).toMatchObject({
      id: 'b',
      place: 'child',
    });
  });
});
