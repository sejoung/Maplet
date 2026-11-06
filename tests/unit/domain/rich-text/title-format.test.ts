import { describe, expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../../../src/domain/commands';
import {
  effectiveTitle,
  formatNodeTitles,
  nodesFormat,
  withoutLegacyEmphasis,
} from '../../../../src/domain/rich-text/title-format';

const map = () => {
  let doc = addNode(createMap('중심'), 'root', 'a', '기획 **회의**');
  doc = addNode(doc, 'root', 'b', '디자인');
  return updateNode(doc, 'b', { style: { fontWeight: 'bold', background: '#fbf0db' } });
};

describe('formatting whole node titles', () => {
  it('treats older whole-node emphasis as formatting of every character', () => {
    const doc = map();
    expect(effectiveTitle(doc.nodes.b)).toBe('**디자인**');
    expect(nodesFormat(doc, ['b'])).toEqual({ bold: true, italic: false, highlight: null });
    expect(nodesFormat(doc, ['a', 'b']).bold).toBeUndefined();
  });

  it('bolds every selected title unless all are bold, then takes it off', () => {
    const bold = formatNodeTitles(map(), ['a', 'b'], { kind: 'bold' });
    expect(bold.nodes.a.title).toBe('**기획 회의**');
    // The old style key moves into the title, other style keys stay.
    expect(bold.nodes.b).toMatchObject({ title: '**디자인**', style: { background: '#fbf0db' } });
    const plain = formatNodeTitles(bold, ['a', 'b'], { kind: 'bold' });
    expect([plain.nodes.a.title, plain.nodes.b.title]).toEqual(['기획 회의', '디자인']);
  });

  it('applies italic and highlight colors, and clears everything', () => {
    let doc = formatNodeTitles(map(), ['a'], { kind: 'italic' });
    expect(doc.nodes.a.title).toBe('*기획 **회의***');
    doc = formatNodeTitles(doc, ['a'], { kind: 'highlight', color: 'pink' });
    expect(doc.nodes.a.title).toBe('=={pink}*기획 **회의***==');
    doc = formatNodeTitles(doc, ['a'], { kind: 'highlight', color: 'pink' });
    expect(doc.nodes.a.title).toBe('*기획 **회의***');
    doc = formatNodeTitles(doc, ['a', 'b'], { kind: 'clear' });
    expect([doc.nodes.a.title, doc.nodes.b.title]).toEqual(['기획 회의', '디자인']);
    expect(doc.nodes.b.style).toEqual({ background: '#fbf0db' });
  });

  it('leaves the map untouched when nothing changes', () => {
    const doc = map();
    expect(formatNodeTitles(doc, ['root'], { kind: 'clear' })).toBe(doc);
    expect(formatNodeTitles(doc, ['missing'], { kind: 'bold' })).toBe(doc);
    const style = { task: 'todo' };
    expect(withoutLegacyEmphasis(style)).toBe(style);
  });
});
