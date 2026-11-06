// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anchorBelow,
  anchorCenter,
  focusNodeLater,
  menuAnchor,
  nodeElement,
  pressTarget,
  TEXT_EDITOR_SELECTOR,
} from '../../../src/components/canvas/canvas-dom';

const rect = { left: 10, top: 20, width: 100, height: 40, bottom: 60 } as DOMRect;

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function nodes() {
  document.body.innerHTML = `
    <div id="canvas">
      <div data-node-id="a&quot;b" tabindex="-1" aria-selected="false"><span>A</span></div>
      <div data-node-id="c" tabindex="0" aria-selected="true">
        <button data-resize-handle><i></i></button>
      </div>
    </div>`;
  // Run frames at once so focus can be checked synchronously.
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => (run(0), 0));
  return document.getElementById('canvas')!;
}

describe('canvas DOM helpers', () => {
  it('anchors keyboard-opened menus and keeps pointer ones at the pointer', () => {
    expect(anchorBelow(rect)).toEqual({ x: 18, y: 64 });
    expect(anchorBelow(rect, 0)).toEqual({ x: 10, y: 64 });
    expect(anchorCenter(rect)).toEqual({ x: 60, y: 40 });
    expect(menuAnchor({ clientX: 0, clientY: 0 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(menuAnchor({ clientX: 5, clientY: 0 }, { x: 1, y: 2 })).toEqual({ x: 5, y: 0 });
  });

  it('finds nodes by id, escaping it', () => {
    const canvas = nodes();
    expect(nodeElement(canvas, 'a"b')?.textContent).toBe('A');
    expect(nodeElement(canvas, 'missing')).toBeNull();
  });

  it('focuses a node, the tab stop, or nothing while a title editor is open', () => {
    const canvas = nodes();
    focusNodeLater('a"b', { root: () => canvas });
    expect(document.activeElement).toBe(nodeElement(canvas, 'a"b'));
    focusNodeLater(null);
    expect(document.activeElement).toBe(nodeElement(canvas, 'c'));
    // Only a node that is still selected.
    focusNodeLater('a"b', { selected: true });
    expect(document.activeElement).toBe(nodeElement(canvas, 'c'));
    canvas.insertAdjacentHTML('beforeend', '<div data-inline-editor tabindex="0"></div>');
    focusNodeLater('a"b', { root: () => canvas, unlessEditing: true });
    expect(document.activeElement).toBe(nodeElement(canvas, 'c'));
    expect(canvas.querySelector(TEXT_EDITOR_SELECTOR)).not.toBeNull();
  });

  it('tells what a press landed on', () => {
    const canvas = nodes();
    const text = canvas.querySelector('span')!;
    expect(pressTarget(text)).toMatchObject({ nodeId: 'a"b', handle: null, control: false });
    const handle = canvas.querySelector('i')!;
    expect(pressTarget(handle)).toMatchObject({ nodeId: 'c', control: true });
    expect(pressTarget(handle).handle).toBe(canvas.querySelector('button'));
    expect(pressTarget(canvas)).toMatchObject({ node: null, nodeId: undefined });
  });
});
