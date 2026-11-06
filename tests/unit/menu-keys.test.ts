import { describe, expect, it, vi } from 'vitest';
import { clampToViewport, focusMenuItem, moveMenuFocus } from '../../src/components/menu-keys';

const menu = (count: number) =>
  Array.from({ length: count }, () => ({ focus: vi.fn() }) as unknown as HTMLElement);
const key = (name: string) => ({ key: name, preventDefault: vi.fn() });
const focused = (list: HTMLElement[]) =>
  list.findIndex((item) => vi.mocked(item.focus).mock.calls.length);

describe('menu keys', () => {
  it('steps with arrows, wrapping at either end, and jumps with Home and End', () => {
    const cases: [string, number, number][] = [
      ['ArrowDown', 1, 2],
      ['ArrowDown', 2, 0],
      ['ArrowUp', 0, 2],
      ['Home', 2, 0],
      ['End', 0, 2],
      // Nothing focused yet: ↓ starts at the top.
      ['ArrowDown', -1, 0],
    ];
    for (const [name, from, to] of cases) {
      const list = menu(3);
      const event = key(name);
      expect(moveMenuFocus(list, event, {}, list[from] ?? null)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(focused(list)).toBe(to);
    }
  });

  it('leaves other keys, and ←→ unless the items run across', () => {
    const list = menu(3);
    const left = key('ArrowLeft');
    expect(moveMenuFocus(list, key('Escape'), {}, list[0])).toBe(false);
    expect(moveMenuFocus(list, left, {}, list[0])).toBe(false);
    expect(left.preventDefault).not.toHaveBeenCalled();
    expect(moveMenuFocus(list, left, { across: true }, list[0])).toBe(true);
    expect(focused(list)).toBe(2);
  });

  it('ignores an empty menu', () => {
    expect(() => focusMenuItem([], 0)).not.toThrow();
    expect(moveMenuFocus([], key('End'), {}, null)).toBe(true);
  });

  it('keeps a menu on screen, flipping it above the point near the bottom', () => {
    const viewport = { width: 800, height: 600 };
    const size = { width: 200, height: 300 };
    expect(clampToViewport({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 });
    expect(clampToViewport({ x: 700, y: 100 }, size, viewport)).toEqual({ x: 592, y: 100 });
    expect(clampToViewport({ x: 100, y: 500 }, size, viewport)).toEqual({ x: 100, y: 200 });
    expect(clampToViewport({ x: -20, y: 200 }, size, { width: 800, height: 400 })).toEqual({
      x: 8,
      y: 8,
    });
  });
});
