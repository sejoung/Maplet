// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addNode, addRoot, createMap, updateNode } from '../../../src/domain/commands';
import {
  mapToMarkdown,
  mapToOpml,
  markdownToMap,
  opmlToMap,
} from '../../../src/adapters/outline/outline';
import { formatOf, openMapFile } from '../../../src/adapters/formats';
import { parseMaplet, serializeMaplet } from '../../../src/adapters/maplet/codec';
import type { MindMap } from '../../../src/domain/model';

let map = addNode(createMap('Plan'), 'root', 'a', 'Research');
map = addNode(map, 'a', 'a1', 'Interview <users> & "teams"');
map = addNode(map, 'root', 'b', 'Build');
map = updateNode(map, 'a', { notes: 'Two weeks\nRemote', links: ['https://example.com/a'] });
const shape = (result: MindMap) => {
  const visit = (id: string): unknown => ({
    title: result.nodes[id].title,
    notes: result.nodes[id].notes,
    links: result.nodes[id].links,
    children: result.nodes[id].children.map(visit),
  });
  return result.roots.map(visit);
};

describe('outline files', () => {
  it('recognizes outline names', () => {
    const outline = (name: string) => Boolean(formatOf(name).needsLayout);
    expect(['a.md', 'b.markdown', 'c.OPML', 'd.txt'].every(outline)).toBe(true);
    expect(outline('e.maplet')).toBe(false);
  });

  it('writes Markdown that reads back with the same hierarchy, notes and links', () => {
    const text = mapToMarkdown(map);
    expect(text).toBe(
      [
        '# Plan',
        '',
        '- [Research](https://example.com/a)',
        '',
        '  Two weeks',
        '  Remote',
        '',
        '  - Interview <users> & "teams"',
        '- Build',
        '',
      ].join('\n'),
    );
    const read = markdownToMap(text, 'file');
    expect(shape(read)).toEqual(shape(map));
    expect(parseMaplet(serializeMaplet(read)).roots).toEqual(read.roots);
  });

  it('reads headings, nested lists, checkboxes and wraps several top items', () => {
    const read = markdownToMap(
      ['Intro text', '# One', '## Two', '- [ ] task', '  1. nested', '# Three'].join('\n'),
      'Notes',
    );
    expect(read.nodes[read.roots[0]].title).toBe('Notes');
    const titles = (id: string): unknown => [
      read.nodes[id].title,
      ...read.nodes[id].children.map(titles),
    ];
    expect(titles(read.roots[0])).toEqual([
      'Notes',
      ['One', ['Two', ['task', ['nested']]]],
      ['Three'],
    ]);
    expect(() => markdownToMap('just text', 'x')).toThrow('file.nothingToImport');
  });

  it('writes OPML that reads back, escaping attributes and keeping several roots', () => {
    const two = addRoot(map, 'extra', 'Second');
    const text = mapToOpml(two, 'Doc & co');
    expect(text).toContain('<title>Doc &amp; co</title>');
    expect(text).toContain('text="Interview &lt;users&gt; &amp; &quot;teams&quot;"');
    expect(text).toContain('_note="Two weeks&#10;Remote"');
    const read = opmlToMap(text, 'fallback');
    expect(read.nodes[read.roots[0]].title).toBe('Doc & co');
    expect(read.nodes[read.roots[0]].children.map((id) => read.nodes[id].title)).toEqual([
      'Plan',
      'Second',
    ]);
    const plan = read.nodes[read.nodes[read.roots[0]].children[0]];
    expect(read.nodes[plan.children[0]]).toMatchObject({
      notes: 'Two weeks\nRemote',
      links: ['https://example.com/a'],
    });
    expect(() => opmlToMap('<opml><nope', 'x')).toThrow('file.notValidOpmlFile');
  });

  it('drops unsafe links and reads plain text by indentation', () => {
    const read = opmlToMap(
      '<opml version="2.0"><body><outline text="x" url="javascript:alert(1)"/></body></opml>',
      'y',
    );
    expect(read.nodes[read.roots[0]].links).toEqual([]);
    const { map: text, needsLayout } = openMapFile(
      'Top\n\tChild\n\t\tGrandchild\n- Next',
      'List.txt',
    );
    expect(needsLayout).toBe(true);
    expect(text.nodes[text.roots[0]].title).toBe('List.txt');
    expect(text.nodes[text.nodes[text.roots[0]].children[0]].children).toHaveLength(1);
  });
});
