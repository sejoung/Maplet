import { describe, expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../../src/domain/commands';
import { nodeCapabilities } from '../../../src/domain/selection';

let map = addNode(createMap('Root'), 'root', 'a', 'A');
map = addNode(map, 'a', 'a1', 'A1');
map = addNode(map, 'root', 'b', 'B');
map = addNode(map, 'root', 'c', 'C');
map = addNode(map, 'root', 'd', 'D');
for (const id of ['a', 'b', 'c']) map = updateNode(map, id, { side: 'right' });
map = updateNode(map, 'd', { side: 'left' });

describe('node capabilities', () => {
  it('limits a root to what keeps the map whole', () => {
    expect(nodeCapabilities(map, 'root')).toEqual({
      group: false,
      canAddSibling: false,
      canDelete: false,
      canMoveBranches: false,
      canMoveUp: false,
      canMoveDown: false,
      canPlace: { left: false, right: false },
      hasChildren: true,
    });
  });

  it('orders among siblings drawn on the same side', () => {
    expect(nodeCapabilities(map, 'a')).toMatchObject({ canMoveUp: false, canMoveDown: true });
    expect(nodeCapabilities(map, 'b')).toMatchObject({ canMoveUp: true, canMoveDown: true });
    // D is alone on the left, though it follows C in the parent's children.
    expect(nodeCapabilities(map, 'c')).toMatchObject({ canMoveUp: true, canMoveDown: false });
    expect(nodeCapabilities(map, 'd')).toMatchObject({ canMoveUp: false, canMoveDown: false });
    expect(nodeCapabilities(map, 'a1')).toMatchObject({ hasChildren: false, canAddSibling: true });
  });

  it('places a branch on the side it is not already on', () => {
    expect(nodeCapabilities(map, 'a').canPlace).toEqual({ left: true, right: false });
    expect(nodeCapabilities(map, 'd').canPlace).toEqual({ left: false, right: true });
  });

  it('acts on every top-level branch of a group and turns ordering off', () => {
    const group = nodeCapabilities(map, 'b', ['b', 'd', 'a1']);
    expect(group).toMatchObject({
      group: true,
      canDelete: true,
      canMoveBranches: true,
      canMoveUp: false,
      canMoveDown: false,
      canPlace: { left: true, right: true },
    });
    // A lies inside the selected root, so the group is the whole map.
    expect(nodeCapabilities(map, 'a', ['a', 'root'])).toMatchObject({
      canDelete: false,
      canMoveBranches: false,
    });
  });
});
