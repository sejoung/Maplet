import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMup, serializeMup, MAX_BYTES, MAX_NODES } from '../../src/adapters/mup/codec';
import { addNode, renameNode } from '../../src/domain/commands';

const fixture = (name: string) => readFileSync(`${process.cwd()}/tests/fixtures/${name}`, 'utf8');

describe('MUP compatibility and data ownership', () => {
  it.each(['v1.mup', 'v2-rich.mup', 'v3-multi.mup', 'v2-notes.mup', 'large.mup'])(
    '%s survives a lossless round trip',
    (name) => {
      const source = fixture(name);
      const doc = parseMup(source);
      expect(JSON.parse(serializeMup(doc))).toEqual(JSON.parse(source));
      expect(doc.original).toBe(source);
      expect(Object.keys(parseMup(serializeMup(doc)).nodes)).toHaveLength(
        Object.keys(doc.nodes).length,
      );
    },
  );
  it('keeps unknown attributes and ranks while editing and adding nodes', () => {
    const source = fixture('v2-rich.mup');
    const edited = addNode(renameNode(parseMup(source), '2', '변경된 생각'), '2', 'new', '자식');
    const raw = JSON.parse(serializeMup(edited));
    expect(raw.ideas['-2'].title).toBe('변경된 생각');
    expect(raw.ideas['-2'].vendor).toEqual({ a: [1, 2] });
    expect(raw.ideas['-2'].attr.attachment.content).toBe('<b>원문</b>');
    expect(raw.resources).toEqual(JSON.parse(source).resources);
    expect(raw.links).toEqual(JSON.parse(source).links);
    expect(parseMup(serializeMup(edited)).nodes.new.title).toBe('자식');
  });
  it('distinguishes v3 aggregate roots from individual ideas', () => {
    const doc = parseMup(fixture('v3-multi.mup'));
    expect(doc.roots).toEqual(['root-a', 'root-b']);
    expect(doc.nodes.left.side).toBe('left');
    expect(doc.nodes['root-a'].parentId).toBeNull();
  });
  it.each([
    '{',
    'null',
    '[]',
    '{}',
    '{"id":1,"title":2}',
    '{"formatVersion":4,"id":1,"title":"x"}',
    '{"id":1,"title":"x","ideas":{"x":{"id":2,"title":"y"}}}',
    '{"id":1,"title":"x","ideas":{"1":{"id":1,"title":"y"}}}',
    '{"id":"__proto__","title":"x"}',
  ])('rejects malformed input: %s', (source) => {
    expect(() => parseMup(source)).toThrow();
  });
  it('rejects size, node count and excessive depth before rendering', () => {
    expect(() => parseMup(' '.repeat(MAX_BYTES + 1))).toThrow(/10|크기/);
    const ideas = Object.fromEntries(
      Array.from({ length: MAX_NODES }, (_, i) => [String(i + 1), { id: i + 1, title: 'x' }]),
    );
    expect(() => parseMup(JSON.stringify({ id: 0, title: 'x', ideas }))).toThrow(/노드/);
    let tree: object = { id: 150, title: 'x' };
    for (let i = 149; i >= 0; i--) tree = { id: i, title: 'x', ideas: { 1: tree } };
    expect(() => parseMup(JSON.stringify(tree))).toThrow(/깊이/);
  });
  it('reports unsupported features without removing their values', () => {
    expect(parseMup(fixture('v2-rich.mup')).warnings.length).toBeGreaterThan(0);
  });
  it('preserves explicitly empty ideas objects', () => {
    const raw = { id: 1, title: 'x', ideas: {} };
    expect(JSON.parse(serializeMup(parseMup(JSON.stringify(raw))))).toEqual(raw);
  });
  it('rejects numeric overflow IDs that cannot survive JSON export', () => {
    expect(() => parseMup('{"id":1e999,"title":"x"}')).toThrow();
    expect(() => parseMup('{"id":1,"title":"x","unknown":1e999}')).toThrow();
  });
});
