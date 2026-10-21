import { describe, expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { layoutMap, type Layout } from '../../src/engine/layout';
import {
  DROP_MAGNET,
  DROP_RELEASE,
  dragFrame,
  dropTargetAt,
  nodesInRect,
  translateBranches,
  type DragFrame,
  type DragState,
} from '../../src/engine/branch-drag';
import { parseMup } from '../../src/adapters/mup/codec';
import { branchSpacingSource } from '../support/drag-fixture';
import { estimateTextWidth } from '../../src/engine/node-measure';

let map = addNode(createMap('Root'), 'root', 'a', 'A');
map = addNode(map, 'a', 'a1', 'A1');
map = addNode(map, 'root', 'b', 'B');
map = addNode(map, 'b', 'b1', 'B1');
const layout = layoutMap(map, estimateTextWidth);
const box = (id: string, from: Layout = layout) => from.nodes.find((node) => node.id === id)!;
const center = (id: string, dx = 0) => {
  const node = box(id);
  return { x: node.x + node.width / 2 + dx, y: node.y + node.height / 2 };
};

describe('dragging branches onto nodes', () => {
  it('targets the node under the pointer that can adopt every dragged branch', () => {
    expect(dropTargetAt(map, layout, ['a1'], center('b'))).toMatchObject({
      id: 'b',
      side: 'right',
    });
    expect(dropTargetAt(map, layout, ['a1', 'b1'], center('a'))).toMatchObject({
      id: 'a',
      side: 'right',
    });
    // The pointer is between nodes, over the dragged branch itself, or over a descendant.
    expect(dropTargetAt(map, layout, ['a1'], { x: -1000, y: -1000 })).toBeNull();
    expect(dropTargetAt(map, layout, ['a'], center('a'))).toBeNull();
    expect(dropTargetAt(map, layout, ['a'], center('a1'))).toBeNull();
    // Dropping on the current parent is a free move, not a reparent.
    expect(dropTargetAt(map, layout, ['a1'], center('a'))).toBeNull();
    // Roots never move under another node.
    expect(dropTargetAt(map, layout, ['root'], center('b'))).toBeNull();
  });

  it('picks the side of a root from the half under the pointer', () => {
    const root = box('root');
    expect(dropTargetAt(map, layout, ['b1'], center('root', -root.width / 4))).toMatchObject({
      id: 'root',
      side: 'left',
    });
    expect(dropTargetAt(map, layout, ['b1'], center('root', root.width / 4))?.side).toBe('right');
  });

  it('ignores hidden nodes and hits the topmost painted node', () => {
    const collapsed = updateNode(map, 'b', { collapsed: true });
    const hidden = layoutMap(collapsed, estimateTextWidth);
    expect(hidden.nodes.some((node) => node.id === 'b1')).toBe(false);
    const stacked = { ...layout, nodes: [...layout.nodes, { ...box('a'), id: 'b' }] };
    expect(dropTargetAt(map, stacked, ['a1'], center('a'))?.id).toBe('b');
  });

  it('translates several branches together without displacing others', () => {
    const proposal = translateBranches(map, layout, ['a', 'b1'], { x: 30, y: -20 })!;
    for (const id of ['a', 'a1', 'b1'])
      expect(proposal.positions[id]).toEqual({ x: box(id).x + 30, y: box(id).y - 20 });
    for (const id of ['root', 'b'])
      expect(proposal.positions[id]).toEqual({ x: box(id).x, y: box(id).y });
    expect(proposal.displacedIds).toEqual([]);
    expect(proposal.regions.map((region) => [region.id, region.nodeIds, region.kind])).toEqual([
      ['a', ['a', 'a1'], 'dragged'],
      ['b1', ['b1'], 'dragged'],
    ]);
    expect(translateBranches(map, layout, ['a'], { x: 2_000_000, y: 0 })).toBeNull();
  });

  it('selects nodes intersecting a rectangle', () => {
    const a = box('a'),
      b1 = box('b1');
    const rect = {
      x: Math.min(a.x, b1.x) + 2,
      y: Math.min(a.y, b1.y) + 2,
      width: Math.abs(b1.x - a.x) + 4,
      height: Math.abs(b1.y - a.y) + 4,
    };
    expect(nodesInRect(layout, rect)).toEqual(expect.arrayContaining(['a', 'b1']));
    expect(nodesInRect(layout, { x: -5000, y: -5000, width: 10, height: 10 })).toEqual([]);
  });
});

describe('reaching a drop target while dragging', () => {
  const spaced = parseMup(branchSpacingSource());
  const start = layoutMap(spaced, estimateTextWidth);
  const at = (id: string, from: Layout = start) => from.nodes.find((node) => node.id === id)!;
  const a = at('a');
  const state = (delta: { x: number; y: number }, extra: Partial<DragState> = {}): DragState => ({
    ids: ['a'],
    head: 'a',
    origin: { x: a.x, y: a.y },
    delta,
    zoom: 1,
    free: false,
    target: null,
    ...extra,
  });
  // `a` moves down so its child covers `b` while `a` itself stays far from every other node.
  const covering = { x: 0, y: at('b').y - at('child').y - 20 };
  /** Place `a` left of `b`, `gap` apart. */
  const beside = (gap: number) => ({ x: at('b').x - gap - a.width - a.x, y: at('b').y - a.y });
  const still = (frame: DragFrame, id: string) =>
    expect(at(id, frame.layout)).toMatchObject({ x: at(id).x, y: at(id).y });

  it('keeps other branches in place and guides where they will make room', () => {
    const frame = dragFrame(spaced, start, state(covering))!;
    expect(frame.target).toBeNull();
    still(frame, 'b');
    still(frame, 'bChild');
    expect(at('a', frame.layout)).toMatchObject({ x: a.x, y: a.y + covering.y });
    expect(frame.proposal.displacedIds).toContain('b');
    const guide = frame.proposal.regions.find((region) => region.kind === 'displaced')!;
    expect(guide.nodeIds).toEqual(['b', 'bChild']);
    expect(guide.y).not.toBe(at('b').y - 12);
  });

  it('pushes branches aside live while Alt is held, without reparenting', () => {
    const free = dragFrame(spaced, start, state(covering, { free: true }))!;
    expect(at('b', free.layout)).not.toMatchObject({ x: at('b').x, y: at('b').y });
    expect(free.proposal.displacedIds).toContain('b');
    expect(dragFrame(spaced, start, state(beside(4), { free: true }))!.target).toBeNull();
  });

  it('captures the node beside the dragged node and releases it with hysteresis', () => {
    const caught = dragFrame(spaced, start, state(beside(DROP_MAGNET - 4)))!;
    expect(caught.target).toMatchObject({ id: 'b', side: 'right', node: 'b', place: 'child' });
    still(caught, 'b');
    expect(caught.proposal.displacedIds).toEqual([]);
    expect(caught.proposal.regions.map((region) => region.kind)).toEqual(['dragged']);
    expect(caught.layout.edges.find((edge) => edge.to === 'a')?.from).toBe('b');
    const follow = (gap: number) =>
      dragFrame(spaced, start, state(beside(gap), { target: caught.target }))!.target;
    expect(follow(DROP_RELEASE - 4)?.id).toBe('b');
    expect(follow(DROP_RELEASE + 8)).toBeNull();
    expect(dragFrame(spaced, start, state(beside(DROP_MAGNET + 4)))!.target).toBeNull();
  });

  it('judges by the dragged node box and scales distances with zoom', () => {
    const b = at('b');
    const probe = { x: b.x - 24 - a.width, y: b.y, width: a.width, height: a.height };
    expect(dropTargetAt(spaced, start, ['a'], probe)).toBeNull();
    expect(dropTargetAt(spaced, start, ['a'], probe, { zoom: 0.5 })?.id).toBe('b');
    // Overlapping several nodes prefers the one whose center is closest.
    const bChild = at('bChild');
    const span = { x: b.x + b.width - 20, y: b.y, height: b.height };
    const width = bChild.x - span.x + 40;
    expect(dropTargetAt(spaced, start, ['a'], { ...span, width })?.id).toBe('bChild');
    expect(dropTargetAt(spaced, start, ['a'], { ...span, x: span.x - 40, width })?.id).toBe('b');
  });
});
