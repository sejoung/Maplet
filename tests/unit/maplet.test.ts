import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMap, addNode, updateNode } from '../../src/domain/commands';
import { setNodePositions } from '../../src/domain/positions';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';
import { parseDocument, nativeFilename, mupFilename } from '../../src/adapters/documents';

function document() {
  return JSON.parse(serializeMaplet(addNode(createMap('Topic'), 'root', 'child', 'Child')));
}

describe('Maplet native format v1', () => {
  it('opens an independently authored native fixture and preserves its extension fields', () => {
    const source = readFileSync('tests/fixtures/native-v1.maplet', 'utf8');
    const map = parseDocument(source);
    expect(map.nodes.left.position).toEqual({ x: -140.5, y: 180.25 });
    expect(map.nodes.left.notes).toBe('Native note');
    expect(JSON.parse(serializeMaplet(map))).toEqual(JSON.parse(source));
  });
  it('supports valid IDs that happen to match inherited object property names', () => {
    for (const id of ['toString', 'valueOf', 'hasOwnProperty']) {
      const raw = document();
      raw.roots = [id];
      raw.nodes = { [id]: { ...raw.nodes.root, id, children: [] } };
      const map = parseMaplet(JSON.stringify(raw));
      expect(map.nodes[id].title).toBe('Topic');
      expect(parseMaplet(serializeMaplet(map)).roots).toEqual([id]);
    }
  });
  it('stores its own versioned node model without wrapping a MindMup document', () => {
    const raw = document();
    expect(raw).toMatchObject({
      format: 'maplet',
      version: 1,
      roots: ['root'],
      nodes: { root: { id: 'root', title: 'Topic', children: ['child'], position: null } },
    });
    expect(raw.ideas).toBeUndefined();
    expect(raw.compatibility).toBeUndefined();
    const encoded = serializeMaplet(parseMaplet(JSON.stringify(raw)));
    expect(serializeMaplet(parseMaplet(encoded))).toBe(encoded);
  });
  it('round-trips positions, hierarchy, side, rank, colors, notes, links and collapse state', () => {
    let map = addNode(createMap(), 'root', 'child', 'Child');
    map = updateNode(map, 'child', {
      side: 'left',
      notes: 'Note',
      links: ['https://example.com'],
      style: { background: '#ffffff' },
    });
    map = updateNode(map, 'root', { collapsed: true });
    map = setNodePositions(map, { root: { x: -120, y: 150 }, child: { x: -450.5, y: 140.25 } });
    const loaded = parseMaplet(serializeMaplet(map));
    for (const id of ['root', 'child']) expect(loaded.nodes[id]).toMatchObject(map.nodes[id]);
  });
  it.each(['v1.mup', 'v2-rich.mup', 'v2-notes.mup', 'v3-multi.mup', 'large.mup'])(
    'preserves all MindMup metadata through native save/reopen: %s',
    (file) => {
      const source = readFileSync(`tests/fixtures/${file}`, 'utf8');
      const encoded = serializeMaplet(parseMup(source));
      const loaded = parseMaplet(encoded);
      expect(serializeMaplet(loaded)).toBe(encoded);
      expect(JSON.parse(serializeMup(loaded))).toEqual(JSON.parse(source));
      expect(loaded.original).toBe(source);
    },
  );
  it('preserves unknown native document, node and compatibility fields', () => {
    const raw = JSON.parse(serializeMaplet(parseMup('{"id":1,"title":"Root"}')));
    raw.futureFeature = { value: 42 };
    raw.nodes['1'].futureStyle = { weight: 2 };
    raw.compatibility.vendor = { keep: true };
    raw.compatibility.mindmup.future = 'keep';
    raw.compatibility.mindmup.nodes['1'].vendor = true;
    const loaded = parseMaplet(JSON.stringify(raw));
    const output = JSON.parse(serializeMaplet(setNodePositions(loaded, { '1': { x: 12, y: 34 } })));
    expect(output).toMatchObject({
      futureFeature: { value: 42 },
      nodes: { '1': { futureStyle: { weight: 2 }, position: { x: 12, y: 34 } } },
      compatibility: {
        vendor: { keep: true },
        mindmup: { future: 'keep', nodes: { '1': { vendor: true } } },
      },
    });
  });
  it('detects native and compatible formats from content and uses distinct extensions', () => {
    expect(parseDocument(serializeMaplet(createMap())).roots).toEqual(['root']);
    expect(parseDocument('{"id":1,"title":"Root"}').roots).toEqual(['1']);
    expect(nativeFilename('map.mup')).toBe('map.maplet');
    expect(nativeFilename('map.maplet')).toBe('map.maplet');
    expect(mupFilename('map.maplet')).toBe('map.mup');
    expect(() => parseDocument('{"format":"maplet","version":99}')).toThrow(/버전/);
  });
  it.each([
    [
      'version',
      (raw: ReturnType<typeof document>) => {
        raw.version = 99;
      },
    ],
    [
      'empty roots',
      (raw: ReturnType<typeof document>) => {
        raw.roots = [];
      },
    ],
    [
      'duplicate roots',
      (raw: ReturnType<typeof document>) => {
        raw.roots.push('root');
      },
    ],
    [
      'missing child',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.root.children.push('missing');
      },
    ],
    [
      'duplicate child',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.root.children.push('child');
      },
    ],
    [
      'cycle',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.children.push('root');
        raw.nodes.root.parentId = 'child';
      },
    ],
    [
      'wrong parent',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.parentId = null;
      },
    ],
    [
      'orphan',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.root.children = [];
      },
    ],
    [
      'id mismatch',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.id = 'different';
      },
    ],
    [
      'invalid side',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.side = 'up';
      },
    ],
    [
      'invalid rank',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.rank = 'Infinity';
      },
    ],
    [
      'invalid position',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.child.position = { x: 1_000_001, y: 0 };
      },
    ],
    [
      'unsafe id',
      (raw: ReturnType<typeof document>) => {
        raw.nodes.constructor = { ...raw.nodes.child, id: 'constructor' };
      },
    ],
    [
      'invalid compatibility',
      (raw: ReturnType<typeof document>) => {
        raw.compatibility = { mindmup: { formatVersion: 99 } };
      },
    ],
  ])('rejects %s before replacing a document', (_name, change) => {
    const raw = document();
    change(raw);
    expect(() => parseMaplet(JSON.stringify(raw))).toThrow();
  });
  it('repairs colliding sibling ranks in children order instead of refusing the document', () => {
    const raw = document();
    raw.nodes.extra = { ...raw.nodes.child, id: 'extra' };
    raw.nodes.root.children.push('extra');
    const map = parseMaplet(JSON.stringify(raw));
    expect(map.nodes.root.children).toEqual(['child', 'extra']);
    expect(map.nodes.child.rank).not.toBe(map.nodes.extra.rank);
    expect(parseMaplet(serializeMaplet(map)).nodes.root.children).toEqual(['child', 'extra']);
  });
  it('keeps only openable links and reports the removal', () => {
    const raw = document();
    raw.nodes.child.links = ['javascript:alert(1)', 'https://example.com'];
    const map = parseMaplet(JSON.stringify(raw));
    expect(map.nodes.child.links).toEqual(['https://example.com']);
    expect(map.warnings).toContain('안전하지 않은 링크는 열 수 없도록 제외했습니다.');
  });
  it('rejects malformed JSON, unsupported identifiers and non-finite extension numbers', () => {
    expect(() => parseMaplet('{bad')).toThrow(/JSON/);
    expect(() => parseMaplet('{"format":"other","version":1}')).toThrow();
    expect(() =>
      parseMaplet(
        serializeMaplet(createMap()).replace('"version": 1', '"version": 1, "extra": 1e999'),
      ),
    ).toThrow();
  });
  it('enforces file size, node count, depth and title limits', () => {
    const huge = ' '.repeat(50 * 1024 * 1024 + 1);
    expect(() => parseMaplet(huge)).toThrow(/크기/);
    expect(() => parseDocument(huge)).toThrow(/크기/);
    const raw = document();
    raw.nodes.root.title = 'x'.repeat(10_001);
    expect(() => parseMaplet(JSON.stringify(raw))).toThrow();
    raw.nodes = Object.fromEntries(Array.from({ length: 5001 }, (_, index) => [`n${index}`, {}]));
    expect(() => parseMaplet(JSON.stringify(raw))).toThrow(/5,000/);
    raw.roots = ['n0'];
    const node = document().nodes.root;
    raw.nodes = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [
        `n${index}`,
        {
          ...node,
          id: `n${index}`,
          parentId: index ? `n${index - 1}` : null,
          children: index === 100 ? [] : [`n${index + 1}`],
        },
      ]),
    );
    expect(() => parseMaplet(JSON.stringify(raw))).toThrow(/깊이/);
    raw.nodes.n99.children = [];
    delete raw.nodes.n100;
    expect(Object.keys(parseMaplet(JSON.stringify(raw)).nodes)).toHaveLength(100);
  });
});
