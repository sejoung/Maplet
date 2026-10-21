import { describe, expect, it } from 'vitest';
import {
  createMap,
  addNode,
  renameNode,
  deleteNode,
  moveNode,
  updateNode,
  isDescendant,
  safeUrl,
} from '../../src/domain/commands';
import { createHistory, commit, undo, redo } from '../../src/application/history';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';

describe('immutable editing commands', () => {
  it('adds, renames, removes a subtree and preserves the input', () => {
    const original = createMap('중심');
    const a = addNode(original, original.roots[0], 'a', '생각');
    const b = addNode(a, 'a', 'b', '다음');
    expect(Object.keys(original.nodes)).toHaveLength(1);
    expect(renameNode(b, 'a', '바꾸기').nodes.a.title).toBe('바꾸기');
    const removed = deleteNode(b, 'a');
    expect(Object.keys(removed.nodes)).toHaveLength(1);
    expect(() => deleteNode(removed, removed.roots[0])).toThrow();
    expect(() => addNode(b, 'a', 'a')).toThrow();
    expect(() => renameNode(b, 'a', ' ')).toThrow();
    expect(() => renameNode(b, 'missing', 'x')).toThrow();
  });
  it('moves across branches without cycles and inherits direction', () => {
    let doc = createMap();
    doc = addNode(doc, doc.roots[0], 'a');
    doc = addNode(doc, doc.roots[0], 'b');
    doc = updateNode(doc, 'b', { side: 'left' });
    doc = addNode(doc, 'a', 'c');
    expect(isDescendant(doc, 'a', 'c')).toBe(true);
    expect(() => moveNode(doc, 'a', 'c')).toThrow('edit.moveCreatesCycle');
    expect(() => moveNode(doc, doc.roots[0], 'c')).toThrow();
    expect(() => moveNode(doc, 'a', 'a')).toThrow();
    const moved = moveNode(doc, 'a', 'b');
    expect(moved.nodes.a.parentId).toBe('b');
    expect(moved.nodes.c.side).toBe('left');
    expect(parseMup(serializeMup(moved)).nodes.c.side).toBe('left');
  });
  it('preserves edited notes, links, styles and collapsed state across export', () => {
    const doc = createMap();
    const edited = updateNode(doc, doc.roots[0], {
      notes: 'common.notes',
      links: ['https://example.com'],
      style: { background: '#fff' },
      collapsed: true,
    });
    const root = parseMup(serializeMup(edited)).nodes[doc.roots[0]];
    expect(root).toMatchObject({
      notes: 'common.notes',
      links: ['https://example.com'],
      collapsed: true,
      style: { background: '#fff' },
    });
    expect(() => updateNode(doc, doc.roots[0], { links: ['javascript:alert(1)'] })).toThrow();
  });
  it('keeps an existing branch rank when its current direction is selected again', () => {
    let doc = addNode(createMap(), 'root', 'a');
    doc = addNode(doc, 'root', 'b');
    const updated = updateNode(doc, 'a', { side: 'right' });
    expect(updated.nodes.a.rank).toBe(doc.nodes.a.rank);
  });
  it('keeps sibling ranks distinct and reloadable after many insertions at one spot', () => {
    let doc = addNode(createMap(), 'root', 'a');
    doc = addNode(doc, 'root', 'b');
    let previous = 'a';
    for (let index = 0; index < 80; index++) {
      doc = addNode(doc, 'root', `n${index}`, 'x', previous);
      previous = `n${index}`;
    }
    const ranks = doc.nodes.root.children.map((id) => doc.nodes[id].rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(parseMaplet(serializeMaplet(doc)).nodes.root.children).toEqual(doc.nodes.root.children);
    expect(doc.nodes.root.children.at(-1)).toBe('b');
  });
  it('refuses to change the direction of a central topic', () => {
    const doc = addNode(createMap(), 'root', 'a');
    expect(() => updateNode(doc, 'root', { side: 'left' })).toThrow('edit.rootSideFixed');
  });
  it('inserts siblings between ranks and rejects unrelated sibling anchors', () => {
    let doc = addNode(createMap(), 'root', 'a');
    doc = addNode(doc, 'root', 'b');
    doc = addNode(doc, 'root', 'between', '중간', 'a');
    expect(parseMup(serializeMup(doc)).nodes.root.children).toEqual(['a', 'between', 'b']);
    expect(() => addNode(doc, 'a', 'bad', 'x', 'b')).toThrow();
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'file:///tmp/x', 'https://'])(
    'rejects unsafe or malformed URLs: %s',
    (url) => expect(safeUrl(url)).toBe(false),
  );
  it.each(['https://example.com', 'http://localhost', 'mailto:me@example.com'])(
    'accepts safe URLs: %s',
    (url) => expect(safeUrl(url)).toBe(true),
  );
});

describe('history', () => {
  it('undoes and redoes edits, and invalidates redo after a new branch', () => {
    const initial = createMap('처음');
    const id = initial.roots[0];
    const one = commit(createHistory(initial), renameNode(initial, id, '다음'));
    expect(undo(one).present.nodes[id].title).toBe('처음');
    expect(redo(undo(one)).present.nodes[id].title).toBe('다음');
    const branch = commit(undo(one), renameNode(initial, id, '다른 생각'));
    expect(branch.future).toHaveLength(0);
    expect(undo(createHistory(initial)).present).toBe(initial);
    expect(redo(one)).toBe(one);
    expect(commit(one, one.present)).toBe(one);
  });
  it('bounds memory to 100 snapshots', () => {
    let h = createHistory(createMap());
    for (let i = 0; i < 130; i++)
      h = commit(h, renameNode(h.present, h.present.roots[0], String(i)));
    expect(h.past).toHaveLength(100);
  });
});
