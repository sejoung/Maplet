import type { LucideIcon } from 'lucide-react';
import { ariaShortcut, shortcutLabel, type Shortcut } from './shortcuts';

/** One command as data; toolbars and menus render it, each at its own icon size. */
export interface MenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a hint; announced through aria-keyshortcuts instead of the name. */
  shortcut?: Shortcut;
  /** Visible text where room is short, such as a toolbar button; `label` stays its name. */
  short?: string;
  /** A state the label already names, also marked with a dot on toolbar buttons. */
  marked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  run(): void;
}

/** Actions shown together; a heading names the group in the menu. */
export type MenuGroup = readonly MenuAction[] | { heading: string; actions: readonly MenuAction[] };

/** One action out of named groups, for a control that shows it on its own. */
export function findAction(groups: Record<string, readonly MenuAction[]>, id: string): MenuAction {
  const found = Object.values(groups)
    .flat()
    .find((action) => action.id === id);
  if (!found) throw new Error(`Unknown menu action: ${id}`);
  return found;
}

/** The action without its key hint, for menus meant for touch such as the toolbar's More. */
export const withoutShortcut = (action: MenuAction): MenuAction => ({
  ...action,
  shortcut: undefined,
});

/**
 * Menu rows for action groups; `role` distinguishes toolbar menus from a context menu. The
 * menu that holds them closes itself when a row is clicked.
 */
export function MenuItems({ groups, role }: { groups: readonly MenuGroup[]; role?: 'menuitem' }) {
  return groups.map((group, index) => {
    const { heading, actions } = 'actions' in group ? group : { heading: null, actions: group };
    return (
      <div key={index} role={role ? 'group' : undefined} className="action-group">
        {index > 0 && <hr />}
        {heading && (
          <span className="menu-label" aria-hidden="true">
            {heading}
          </span>
        )}
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role={role}
            className={action.danger ? 'danger-quiet' : undefined}
            disabled={action.disabled}
            aria-keyshortcuts={action.shortcut && ariaShortcut(action.shortcut)}
            onClick={action.run}
          >
            <action.icon size={17} />
            {action.label}
            {action.shortcut && <kbd aria-hidden="true">{shortcutLabel(action.shortcut)}</kbd>}
          </button>
        ))}
      </div>
    );
  });
}
