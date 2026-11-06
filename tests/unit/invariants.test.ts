import { describe, expect, it } from 'vitest';
import { addNode, addRoot, canMoveNode, createMap, moveNode } from '../../src/domain/commands';
import {
  assertNewId,
  assertRoom,
  moveViolation,
  nodeOf,
  titleOf,
} from '../../src/domain/invariants';
import { MAX_DEPTH, MAX_NODE_COUNT, MAX_TITLE } from '../../src/domain/model';

let map = addNode(createMap('Root'), 'root', 'a', 'A');
map = addNode(map, 'a', 'a1', 'A1');
map = addNode(map, 'root', 'b', 'B');

describe('command preconditions', () => {
  it('looks up nodes and validates titles', () => {
    expect(nodeOf(map, 'a').title).toBe('A');
    expect(() => nodeOf(map, 'toString')).toThrow('edit.nodeNotFound');
    expect(titleOf('x')).toBe('x');
    expect(() => titleOf('  ')).toThrow('edit.enterTitleBetween1Characters');
    expect(() => titleOf('x'.repeat(MAX_TITLE + 1))).toThrow('edit.enterTitleBetween1Characters');
  });

  it('rejects duplicate or reserved IDs and documents that are full', () => {
    expect(() => assertNewId(map, 'fresh')).not.toThrow();
    expect(() => assertNewId(map, 'a')).toThrow('common.duplicateInvalidNodeId');
    expect(() => assertNewId(map, '__proto__')).toThrow('common.duplicateInvalidNodeId');
    expect(() => assertRoom(map, MAX_NODE_COUNT - 4)).not.toThrow();
    expect(() => assertRoom(map, MAX_NODE_COUNT - 3)).toThrow('edit.nodeLimit');
  });

  it('names why a branch cannot move, in the order commands report it', () => {
    expect(moveViolation(map, 'a1', 'b')).toBeNull();
    expect(moveViolation(map, 'a1', 'a')).toBeNull();
    expect(moveViolation(map, 'missing', 'b')?.key).toBe('edit.nodeNotFound');
    expect(moveViolation(map, 'a', 'missing')?.key).toBe('edit.nodeNotFound');
    expect(moveViolation(map, 'a', 'a')?.key).toBe('edit.moveCreatesCycle');
    expect(moveViolation(map, 'a', 'a1')?.key).toBe('edit.moveCreatesCycle');
    const twoRoots = addRoot(map, 'r2', 'Second');
    expect(moveViolation(twoRoots, 'root', 'r2')?.key).toBe('edit.cannotMoveCentralNodeUnder');
    let deep = map;
    for (let depth = 3; depth < MAX_DEPTH; depth++)
      deep = addNode(deep, depth === 3 ? 'a1' : `d${depth - 1}`, `d${depth}`, 'D');
    expect(moveViolation(deep, 'a', 'b')?.key).toBe('common.depthLimit');
    expect(() => moveNode(deep, 'a', 'b')).toThrow('common.depthLimit');
  });

  it('keeps canMoveNode and moveNode consistent', () => {
    expect(canMoveNode(map, 'a1', 'b')).toBe(true);
    expect(canMoveNode(map, 'a1', 'a')).toBe(false);
    expect(canMoveNode(map, 'missing', 'a')).toBe(false);
    expect(moveNode(map, 'a1', 'a')).toBe(map);
    expect(() => moveNode(map, 'a', 'a1')).toThrow('edit.moveCreatesCycle');
  });
});
