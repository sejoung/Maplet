import type { LucideIcon } from 'lucide-react';
import type { MenuAction } from './menu-actions';
import { ariaShortcut, withShortcut } from './shortcuts';

/**
 * An action as a toolbar button: icon-only unless `labelled`, named by the action's label
 * (or `label`). Toolbar space is tight, so the presentation may differ from the menus while
 * the command, state and shortcut come from the same action.
 */
export function ToolbarButton({
  action,
  labelled = false,
  label = action.label,
  title,
  hint = false,
  icon: Icon = action.icon,
  className = '',
}: {
  action: MenuAction;
  /** Shows text beside the icon: the action's short text, or its label. */
  labelled?: boolean;
  label?: string;
  /** A longer tooltip than the name. */
  title?: string;
  /** Names the shortcut in the tooltip: "Undo (Ctrl/⌘ Z)". */
  hint?: boolean;
  icon?: LucideIcon;
  className?: string;
}) {
  const { shortcut } = action;
  return (
    <button
      type="button"
      className={`${labelled ? 'tool-button' : 'icon-button'} ${className}`.trim()}
      aria-label={label}
      title={title ?? (hint && shortcut ? withShortcut(label, shortcut) : label)}
      aria-keyshortcuts={shortcut && ariaShortcut(shortcut)}
      disabled={action.disabled}
      onClick={action.run}
    >
      <Icon size={17} />
      {labelled && <span>{action.short ?? action.label}</span>}
      {/* The dot is visual only; the label names the state. */}
      {action.marked && <span className="tool-dot" aria-hidden="true" />}
    </button>
  );
}
