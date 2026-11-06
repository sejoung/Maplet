/**
 * The keyboard shortcuts the interface names. Menus, tooltips, the help dialog and
 * `aria-keyshortcuts` all format them from here, so a key cannot say one thing in a menu
 * and another in the help. The handlers stay with what they act on (canvas-keyboard,
 * useEditorView, the app's save and history keys).
 */

/** `KeyboardEvent.key` names; `Mod` is Ctrl, or ⌘ on a Mac. */
type Chord = readonly string[];

export interface Shortcut {
  /** Key combinations; menus show the first, the help and assistive tech all of them. */
  chords: readonly Chord[];
  /** What it does, as the shortcut help describes it. */
  description: string;
}

const keys = (description: string, ...chords: Chord[]): Shortcut => ({ chords, description });

export const SHORTCUTS = {
  addChild: keys('common.addChildNode', ['Tab']),
  addSibling: keys('common.addSiblingNode', ['Enter']),
  editTitle: keys('common.editTitle', ['F2']),
  bold: keys('shortcuts.boldSelection', ['Mod', 'B']),
  italic: keys('shortcuts.italicSelection', ['Mod', 'I']),
  highlight: keys('shortcuts.highlightSelection', ['Mod', 'Shift', 'H']),
  clearFormat: keys('shortcuts.clearInlineFormat', ['Mod', '\\']),
  deleteNode: keys('shortcuts.deleteNodeDescendants', ['Delete'], ['Backspace']),
  copy: keys('menu.copy', ['Mod', 'C']),
  cut: keys('menu.cut', ['Mod', 'X']),
  paste: keys('menu.paste', ['Mod', 'V']),
  duplicate: keys('shortcuts.duplicateBranch', ['Mod', 'D']),
  moveUp: keys('menu.moveUp', ['Alt', 'ArrowUp']),
  moveDown: keys('menu.moveDown', ['Alt', 'ArrowDown']),
  undo: keys('common.undo', ['Mod', 'Z']),
  redo: keys('common.redo', ['Mod', 'Shift', 'Z']),
  save: keys('shortcuts.downloadMapletFile', ['Mod', 'S']),
  zoomIn: keys('common.zoomIn', ['Mod', '+']),
  zoomOut: keys('common.zoomOut', ['Mod', '-']),
  fit: keys('common.fitScreen', ['Mod', '0']),
  find: keys('shortcuts.findNodes', ['Mod', 'F']),
  selectAll: keys('shortcuts.selectAllVisibleNodes', ['Mod', 'A']),
  clearSelection: keys('shortcuts.clearMultiNodeSelection', ['Escape']),
} as const satisfies Record<string, Shortcut>;

interface Style {
  mod: string;
  join: string;
  names?: Record<string, string>;
}
const NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: '⌫',
  Escape: 'Esc',
};
// Each place keeps the notation it has always shown; only the keys are shared.
const STYLES = {
  /** Menu rows and toolbar tooltips: "Ctrl/⌘ Shift Z". */
  menu: { mod: 'Ctrl/⌘', join: ' ' },
  /** The text format menu: "⌘/Ctrl B". */
  format: { mod: '⌘/Ctrl', join: ' ' },
  /** ASCII only, as in the download button's tooltip: "Ctrl/Cmd+S". */
  plain: { mod: 'Ctrl/Cmd', join: '+' },
  /** The shortcut help: "⌘ / Ctrl + Shift + Z". */
  help: { mod: '⌘ / Ctrl', join: ' + ', names: { '-': '−' } },
} as const satisfies Record<string, Style>;
export type ShortcutStyle = Exclude<keyof typeof STYLES, 'help'>;

const keyName = (key: string, style: Style) =>
  key === 'Mod' ? style.mod : (style.names?.[key] ?? NAMES[key] ?? key);
const chordLabel = (chord: Chord, style: Style) =>
  chord.map((key) => keyName(key, style)).join(style.join);

/** A shortcut as a menu, tooltip or the format menu shows it: its first combination. */
export const shortcutLabel = (shortcut: Shortcut, style: ShortcutStyle = 'menu') =>
  chordLabel(shortcut.chords[0], STYLES[style]);

/** A tooltip naming a command and its shortcut: "Undo (Ctrl/⌘ Z)". */
export const withShortcut = (label: string, shortcut: Shortcut, style: ShortcutStyle = 'menu') =>
  `${label} (${shortcutLabel(shortcut, style)})`;

/** `aria-keyshortcuts`: every combination, with `Mod` as both Control and Meta. */
export const ariaShortcut = (shortcut: Shortcut) =>
  shortcut.chords
    .flatMap((chord) =>
      chord.includes('Mod')
        ? ['Control', 'Meta'].map((mod) => chord.map((key) => (key === 'Mod' ? mod : key)))
        : [chord],
    )
    .map((chord) => chord.join('+'))
    .join(' ');

/**
 * Related shortcuts in one help row, sharing their modifiers once: "⌘ / Ctrl + C · X · V",
 * "Alt + ↑ / ↓", or alternatives such as "Delete / ⌫".
 */
export function helpLabel(shortcuts: readonly Shortcut[], separator = ' / '): string {
  const chords = shortcuts.flatMap((shortcut) => shortcut.chords);
  const longest = Math.min(...chords.map((chord) => chord.length)) - 1;
  let shared = 0;
  while (shared < longest && chords.every((chord) => chord[shared] === chords[0][shared])) shared++;
  const style = STYLES.help;
  const rest = chords.map((chord) => chordLabel(chord.slice(shared), style)).join(separator);
  return shared ? `${chordLabel(chords[0].slice(0, shared), style)}${style.join}${rest}` : rest;
}
