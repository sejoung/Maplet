import { describe, expect, it } from 'vitest';
import {
  addNode,
  addRoot,
  createMap,
  deleteNodes,
  insertNodes,
  moveNode,
  moveNodes,
  moveSibling,
  renameNode,
  setBranchSide,
  showLevels,
  updateNode,
  updateNodes,
} from '../../src/domain/commands';
import { copyBranches, pasteFragment } from '../../src/domain/clipboard';
import { addConnection, removeConnection } from '../../src/domain/connections';
import { mergeMaps } from '../../src/domain/merge';
import { rebuildTree } from '../../src/domain/merge-tree';
import type { MindMap } from '../../src/domain/model';
import { resizeNode } from '../../src/domain/node-size';
import {
  positionsForSubtreeMove,
  resetNodePositions,
  setNodePositions,
} from '../../src/domain/positions';
import { formatNodeTitles } from '../../src/domain/title-format';
import { autoArrange } from '../../src/engine/auto-arrange';
import { dragFrame, dropTargetAt, translateBranches } from '../../src/engine/branch-drag';
import { focusLayout } from '../../src/engine/focus';
import { layoutMap, layoutWithPositions, moveLayoutSubtree } from '../../src/engine/layout';
import { proposeSubtreeMove } from '../../src/engine/subtree-placement';
import { renderSvg } from '../../src/engine/svg-export';

/** Freeze every object reachable from `value`, so any write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

let built = addNode(createMap('Root'), 'root', 'a', 'A');
built = addNode(built, 'a', 'a1', 'A1');
built = addNode(built, 'a', 'a2', 'A2');
built = addNode(built, 'root', 'b', 'B');
built = addNode(built, 'root', 'c', 'C');
built = updateNode(built, 'c', {
  side: 'left',
  style: { fontWeight: 'bold', branchColor: '#3b6fb6' },
});
built = setNodePositions(built, { b: { x: 400, y: 40 } });
built = addConnection(built, 'a1', 'c');
built = addRoot(built, 'r2', 'Second', { x: 0, y: 600 });
const map = deepFreeze(built);
const layout = deepFreeze(layoutMap(map));
const ids = () => crypto.randomUUID();

describe('pure commands and layout', () => {
  it.each<[string, () => unknown]>([
    ['addNode', () => addNode(map, 'a', 'new', 'New', 'a1')],
    ['addRoot', () => addRoot(map, 'r3', 'Third')],
    ['renameNode', () => renameNode(map, 'a', 'Renamed')],
    ['deleteNodes', () => deleteNodes(map, ['a1', 'c'])],
    ['moveNode', () => moveNode(map, 'a2', 'b')],
    ['moveNodes', () => moveNodes(map, ['a1', 'c'], 'b')],
    ['insertNodes', () => insertNodes(map, ['c', 'a2'], 'root', { id: 'a', after: true })],
    ['moveSibling', () => moveSibling(map, 'a', 1)],
    ['updateNode', () => updateNode(map, 'a1', { notes: 'n', side: 'left', collapsed: true })],
    ['updateNodes', () => updateNodes(map, ['a', 'b'], 'a', { style: { fontSize: 20 } })],
    ['setBranchSide', () => setBranchSide(map, 'a2', 'left')],
    ['showLevels', () => showLevels(map, 1)],
    ['setNodePositions', () => setNodePositions(map, { a: { x: 1, y: 2 } })],
    ['resetNodePositions', () => resetNodePositions(map)],
    [
      'positionsForSubtreeMove',
      () => positionsForSubtreeMove(map, deepFreeze({ b: { x: 400, y: 40 } }), 'b', { x: 0, y: 0 }),
    ],
    ['resizeNode', () => resizeNode(map, 'a', 120, { a: { x: 5, y: 5 } })],
    ['formatNodeTitles', () => formatNodeTitles(map, ['a', 'c'], { kind: 'bold' })],
    ['connections', () => removeConnection(addConnection(map, 'a', 'b'), 'a1', 'c')],
    ['paste', () => pasteFragment(map, copyBranches(map, ['a']), 'b', ids, undefined)],
    ['duplicate', () => pasteFragment(map, copyBranches(map, ['a1']), 'a', ids, 'a1')],
    ['autoArrange', () => autoArrange(map)],
    ['layoutMap', () => layoutMap(map)],
    ['moveLayoutSubtree', () => moveLayoutSubtree(map, layout, 'a', { x: 900, y: 900 })],
    ['layoutWithPositions', () => layoutWithPositions(layout, { a: { x: -500, y: 10 } })],
    ['focusLayout', () => focusLayout(map, layout, 'a')],
    ['proposeSubtreeMove', () => proposeSubtreeMove(map, layout, 'c', { x: 400, y: 40 })],
    ['translateBranches', () => translateBranches(map, layout, ['a', 'c'], { x: 30, y: 30 })],
    ['dropTargetAt', () => dropTargetAt(map, layout, ['c'], { x: 0, y: 0 })],
    [
      'dragFrame',
      () =>
        dragFrame(map, layout, {
          ids: ['c'],
          head: 'c',
          origin: { x: 0, y: 0 },
          delta: { x: 200, y: 20 },
          zoom: 1,
          free: true,
          target: null,
        }),
    ],
    ['renderSvg', () => renderSvg(map, layout)],
  ])('%s never writes to its input', (_name, run) => {
    expect(run).not.toThrow();
  });

  it('merges frozen versions, including a structural conflict, without writing to them', () => {
    const local = deepFreeze(moveNode(map, 'a', 'b'));
    const remote = deepFreeze(moveNode(map, 'b', 'a'));
    const merged = mergeMaps(map, local, remote);
    expect(merged.conflicts.length).toBeGreaterThan(0);
    expect(Object.keys(merged.map.nodes).sort()).toEqual(Object.keys(map.nodes).sort());
    expect(rebuildTree(map)).not.toBe(map);
  });

  it('shares untouched nodes and returns the input for no-op commands', () => {
    const added = addNode(map, 'a', 'new', 'New');
    expect(added.nodes.b).toBe(map.nodes.b);
    expect(added.nodes.a).not.toBe(map.nodes.a);
    expect(map.nodes.a.children).toEqual(['a1', 'a2']);
    const noOps: MindMap[] = [
      moveNode(map, 'a1', 'a'),
      updateNode(map, 'a', { notes: '' }),
      setBranchSide(map, 'a', 'right'),
      showLevels(map, null),
      setNodePositions(map, { b: { x: 400, y: 40 } }),
      renameNode(map, 'a', 'A'),
    ];
    for (const result of noOps) expect(result).toBe(map);
  });
});
