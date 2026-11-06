// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  documentDownload,
  exportMap,
  FORMATS,
  formatOf,
  isAutosaveFile,
  isNativeName,
  openMapFile,
} from '../../src/adapters/formats';
import { serializeMaplet } from '../../src/adapters/maplet/codec';
import { addNode, createMap } from '../../src/domain/commands';
import { stripMapExtension } from '../../src/domain/filename';

const MiB = 1024 * 1024;
const map = addNode(createMap('Plan'), 'root', 'a', 'Research');

describe('format registry', () => {
  it('chooses a format by extension, case-insensitively, with JSON as the fallback', () => {
    expect(formatOf('a.MAPLET').id).toBe('maplet');
    expect(formatOf('a.original.mup').id).toBe('mup');
    expect(formatOf('a.markdown').id).toBe('markdown');
    expect(formatOf('a.md').id).toBe('markdown');
    expect(formatOf('a.OPML').id).toBe('opml');
    expect(formatOf('a.txt').id).toBe('text');
    expect(formatOf('a.json').id).toBe('json');
    expect(formatOf('a.maplet.bak').id).toBe('json');
    expect(formatOf('').id).toBe('json');
  });

  it('gives MindMup and outlines the smaller size budget', () => {
    const limits = Object.fromEntries(FORMATS.map((format) => [format.id, format.maxBytes / MiB]));
    expect(limits).toEqual({ maplet: 50, mup: 10, json: 50, markdown: 10, opml: 10, text: 10 });
  });

  it('strips exactly the JSON formats’ extensions from map names', () => {
    for (const format of FORMATS)
      for (const extension of format.extensions)
        expect(stripMapExtension(`a.${extension}`) === 'a', extension).toBe(
          format.mime === 'application/json',
        );
  });

  it('opens JSON by content and asks for a layout only for outlines', () => {
    const native = openMapFile(serializeMaplet(map), 'renamed.mup');
    expect(native).toMatchObject({ needsLayout: false, map: { roots: ['root'] } });
    expect(openMapFile('{"id":1,"title":"Root"}', 'old.maplet').map.roots).toEqual(['1']);
    const outline = openMapFile('# One\n\n# Two', 'notes.md');
    expect(outline.needsLayout).toBe(true);
    expect(outline.map.nodes[outline.map.roots[0]].title).toBe('notes.md');
    const opml = openMapFile(
      '<opml version="2.0"><body><outline text="Only"/></body></opml>',
      'a.opml',
    );
    expect(opml.map.nodes[opml.map.roots[0]].title).toBe('Only');
    expect(() => openMapFile(' '.repeat(10 * MiB + 1), 'big.txt')).toThrow('limit: 10');
  });

  it('words a broken file for the format its name promised', () => {
    expect(() => openMapFile('{bad', 'a.mup')).toThrow('file.invalidMupJson');
    expect(() => openMapFile('{bad', 'a.maplet')).toThrow('file.invalidJson');
    expect(() => openMapFile('{bad', 'a.json')).toThrow('file.invalidJson');
    expect(() => openMapFile(' '.repeat(50 * MiB + 1), 'a.maplet')).toThrow(
      'file.mapletFilesMustMibSmaller',
    );
    // MindMup content keeps its own limit even under a native name.
    expect(() => openMapFile(`{"id":1,"title":"x"}${' '.repeat(10 * MiB)}`, 'a.maplet')).toThrow(
      'file.filesMustMibSmaller (limit: 10)',
    );
  });

  it('reports the same node and depth limits from every format', () => {
    const many = Array.from({ length: 5_001 }, (_, index) => index);
    const tooMany = {
      maplet: JSON.stringify({
        format: 'maplet',
        version: 1,
        roots: ['n0'],
        nodes: Object.fromEntries(many.map((index) => [`n${index}`, {}])),
      }),
      mup: JSON.stringify({
        id: 0,
        title: 'x',
        ideas: Object.fromEntries(many.map((index) => [index + 1, { id: index + 1, title: 'x' }])),
      }),
      txt: many.map(() => 'x').join('\n'),
    };
    for (const [extension, source] of Object.entries(tooMany))
      expect(() => openMapFile(source, `a.${extension}`), extension).toThrow(
        'file.mapMustHaveMostNodes (max: 5,000)',
      );
    const levels = Array.from({ length: 101 }, (_, index) => index);
    let idea: object = { id: 101, title: 'x' };
    for (const index of [...levels].reverse()) idea = { id: index, title: 'x', ideas: { 1: idea } };
    const deep = {
      mup: JSON.stringify(idea),
      txt: levels.map((index) => `${' '.repeat(index)}x`).join('\n'),
      md: levels.map((index) => `${'  '.repeat(index)}- x`).join('\n'),
    };
    for (const [extension, source] of Object.entries(deep))
      expect(() => openMapFile(source, `a.${extension}`), extension).toThrow(
        'common.depthLimit (max: 100)',
      );
  });

  it('exports writable formats with their extension and MIME type', () => {
    expect(exportMap(map, 'md', 'Plan')).toMatchObject({
      name: 'Plan.md',
      type: 'text/markdown;charset=utf-8',
      content: expect.stringContaining('# Plan'),
    });
    expect(exportMap(map, 'opml', 'Plan')).toMatchObject({
      name: 'Plan.opml',
      type: 'text/x-opml;charset=utf-8',
    });
    expect(exportMap(map, 'mup', 'Plan')).toMatchObject({
      name: 'Plan.mup',
      type: 'application/json;charset=utf-8',
    });
    expect(() => exportMap(map, 'txt', 'Plan')).toThrow('No writer');
  });

  it('keeps map document names and saves anything else as native', () => {
    expect(documentDownload('{}', 'a.mup').name).toBe('a.mup');
    expect(documentDownload('{}', 'a.MAPLET').name).toBe('a.MAPLET');
    expect(documentDownload('{}', 'notes')).toEqual({
      content: '{}',
      name: 'notes.maplet',
      type: 'application/json;charset=utf-8',
    });
  });

  it('autosaves only into a native file inside the save folder', () => {
    expect(isNativeName('map.Maplet')).toBe(true);
    expect(isNativeName('map.mup')).toBe(false);
    expect(isAutosaveFile({ name: 'map.maplet', parents: ['folder'] }, 'folder')).toBe(true);
    expect(isAutosaveFile({ name: 'map.maplet', parents: ['other'] }, 'folder')).toBe(false);
    expect(isAutosaveFile({ name: 'map.maplet' }, 'folder')).toBe(false);
    expect(isAutosaveFile({ name: 'map.mup', parents: ['folder'] }, 'folder')).toBe(false);
  });
});
