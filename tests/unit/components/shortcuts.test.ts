import { describe, expect, it } from 'vitest';
import {
  ariaShortcut,
  helpLabel,
  SHORTCUTS,
  shortcutLabel,
  withShortcut,
} from '../../../src/components/menus/shortcuts';

describe('shortcut registry', () => {
  it('shows each place its own notation of the same keys', () => {
    expect(shortcutLabel(SHORTCUTS.redo)).toBe('Ctrl/⌘ Shift Z');
    expect(shortcutLabel(SHORTCUTS.moveUp)).toBe('Alt ↑');
    expect(shortcutLabel(SHORTCUTS.zoomOut)).toBe('Ctrl/⌘ -');
    expect(shortcutLabel(SHORTCUTS.bold, 'format')).toBe('⌘/Ctrl B');
    expect(shortcutLabel(SHORTCUTS.clearFormat, 'format')).toBe('⌘/Ctrl \\');
    expect(withShortcut('Undo', SHORTCUTS.undo)).toBe('Undo (Ctrl/⌘ Z)');
    expect(withShortcut('Download', SHORTCUTS.save, 'plain')).toBe('Download (Ctrl/Cmd+S)');
    // Menus show the first combination only.
    expect(shortcutLabel(SHORTCUTS.deleteNode)).toBe('Delete');
  });

  it('announces every combination, with Mod as Control and Meta', () => {
    expect(ariaShortcut(SHORTCUTS.undo)).toBe('Control+Z Meta+Z');
    expect(ariaShortcut(SHORTCUTS.redo)).toBe('Control+Shift+Z Meta+Shift+Z');
    expect(ariaShortcut(SHORTCUTS.moveDown)).toBe('Alt+ArrowDown');
    expect(ariaShortcut(SHORTCUTS.deleteNode)).toBe('Delete Backspace');
  });

  it('writes related shortcuts in one help row with shared modifiers once', () => {
    expect(helpLabel([SHORTCUTS.redo])).toBe('⌘ / Ctrl + Shift + Z');
    expect(helpLabel([SHORTCUTS.addChild])).toBe('Tab');
    expect(helpLabel([SHORTCUTS.clearSelection])).toBe('Esc');
    expect(helpLabel([SHORTCUTS.deleteNode])).toBe('Delete / ⌫');
    expect(helpLabel([SHORTCUTS.copy, SHORTCUTS.cut, SHORTCUTS.paste], ' · ')).toBe(
      '⌘ / Ctrl + C · X · V',
    );
    expect(helpLabel([SHORTCUTS.moveUp, SHORTCUTS.moveDown])).toBe('Alt + ↑ / ↓');
    expect(helpLabel([SHORTCUTS.zoomIn, SHORTCUTS.zoomOut, SHORTCUTS.fit])).toBe(
      '⌘ / Ctrl + + / − / 0',
    );
  });
});
