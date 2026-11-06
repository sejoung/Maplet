import { describe, expect, it } from 'vitest';
import {
  nodeClassNames,
  nodeStyle,
  notesPreview,
  type NodeFlags,
} from '../../../src/components/canvas/node/node-presentation';
import { nodeTypography } from '../../../src/domain/style/typography';

const flags = (fields: Partial<NodeFlags> = {}): NodeFlags => ({
  root: false,
  chosen: false,
  multi: false,
  dragging: false,
  drop: null,
  match: false,
  taskDone: false,
  bold: false,
  customBackground: false,
  ...fields,
});

describe('node presentation', () => {
  it('names a node’s state in its classes', () => {
    expect(nodeClassNames(flags())).toBe('mind-node');
    expect(nodeClassNames(flags({ root: true, chosen: true, multi: true, drop: 'child' }))).toBe(
      'mind-node root-node selected multi drop-target',
    );
    expect(
      nodeClassNames(
        flags({ dragging: true, drop: 'sibling', match: true, taskDone: true, bold: true }),
      ),
    ).toBe('mind-node dragging drop-sibling search-match task-done bold-node');
    expect(nodeClassNames(flags({ customBackground: true }))).toBe('mind-node custom-bg');
  });

  it('places and styles the node box', () => {
    const typography = nodeTypography({ fontWeight: 'bold', fontStyle: 'italic' });
    const style = nodeStyle({ x: 1, y: 2, width: 30, height: 40 }, typography, {
      border: '#123456',
      background: '#fedcba',
    }) as Record<string, unknown>;
    expect(style).toMatchObject({
      left: 1,
      top: 2,
      width: 30,
      minHeight: 40,
      fontWeight: 700,
      fontStyle: 'italic',
      background: '#fedcba',
      '--node-border-color': '#123456',
      lineHeight: `${typography.lineHeight}px`,
    });
    const plain = nodeStyle({ x: 0, y: 0, width: 1, height: 1 }, nodeTypography({}), {
      border: null,
      background: '',
    }) as Record<string, unknown>;
    // Theme colors apply where none was chosen.
    expect(plain.background).toBeUndefined();
    expect(plain['--node-border-color']).toBeUndefined();
    expect(plain.fontWeight).toBeUndefined();
  });

  it('shortens long notes for the tooltip', () => {
    expect(notesPreview('short')).toBe('short');
    expect(notesPreview('x'.repeat(250))).toBe(`${'x'.repeat(200)}…`);
  });
});
