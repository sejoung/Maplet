/** Keyboard and placement rules every menu shares: toolbar menus, the node and format menus. */

interface Point {
  x: number;
  y: number;
}
interface Size {
  width: number;
  height: number;
}

/** Focus the item at `index`, wrapping around either end. */
export function focusMenuItem(list: readonly HTMLElement[], index: number) {
  list[(index + list.length) % list.length]?.focus();
}

/**
 * ↑↓ step through a menu's items (←→ too with `across`, for items laid out in a row) and
 * Home and End jump to its ends. Returns whether the key moved focus, so the caller can
 * handle the rest (Escape, Tab).
 */
export function moveMenuFocus(
  list: readonly HTMLElement[],
  event: { key: string; preventDefault(): void },
  { across = false } = {},
  active: Element | null = document.activeElement,
): boolean {
  const index = list.indexOf(active as HTMLElement);
  const steps: Record<string, number> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    Home: 0,
    End: list.length - 1,
    ...(across ? { ArrowRight: index + 1, ArrowLeft: index - 1 } : {}),
  };
  if (!Object.hasOwn(steps, event.key)) return false;
  event.preventDefault();
  focusMenuItem(list, steps[event.key]);
  return true;
}

/**
 * Where a menu of `size` opened at `at` fits on screen: pushed in from the right edge, and
 * flipped above the point when it would run past the bottom.
 */
export function clampToViewport(at: Point, size: Size, viewport: Size, margin = 8): Point {
  return {
    x: Math.max(margin, Math.min(at.x, viewport.width - size.width - margin)),
    y: Math.max(margin, at.y + size.height > viewport.height - margin ? at.y - size.height : at.y),
  };
}

export const viewportSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
