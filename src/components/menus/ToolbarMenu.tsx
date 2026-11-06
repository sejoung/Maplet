import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { focusMenuItem, moveMenuFocus } from './menu-keys';

const items = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLButtonElement>('.menu-items button:not(:disabled)'),
];

/** Menu keys on the trigger and within the open list; see `ToolbarMenu`. */
function navigate(
  details: HTMLDetailsElement,
  trigger: HTMLElement | null,
  focusOnOpen: { current: 'first' | 'last' | null },
  event: KeyboardEvent,
) {
  if (event.key === 'Escape' && details.open) {
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    trigger?.focus();
    return;
  }
  const list = items(details);
  const onTrigger = event.target === trigger;
  if (onTrigger && (event.key === 'Enter' || event.key === ' ')) focusOnOpen.current = 'first';
  else if (onTrigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    if (details.open) focusMenuItem(list, event.key === 'ArrowDown' ? 0 : -1);
    else {
      focusOnOpen.current = event.key === 'ArrowDown' ? 'first' : 'last';
      details.open = true;
    }
  } else if (!onTrigger) moveMenuFocus(list, event);
}

/**
 * A disclosure of command buttons. Keys match the context menu: ↓ opens and moves into the
 * list, ↑↓/Home/End move within it, and Escape closes it and returns focus to the trigger.
 * Clicking a command closes the menu before the command runs.
 */
export function ToolbarMenu({
  label,
  icon: Icon,
  children,
  className = '',
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  // Opening from the keyboard moves into the list; a pointer click leaves focus on the trigger.
  const focusOnOpen = useRef<'first' | 'last' | null>(null);
  useEffect(() => {
    const details = menu.current!;
    const closeOutside = (event: Event) => {
      if (!details.contains(event.target as Node)) details.open = false;
    };
    const keydown = (event: KeyboardEvent) =>
      navigate(details, trigger.current, focusOnOpen, event);
    document.addEventListener('pointerdown', closeOutside);
    details.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      details.removeEventListener('keydown', keydown);
    };
  }, []);
  return (
    <details
      ref={menu}
      className={`toolbar-menu ${className}`}
      onToggle={(event) => {
        const details = event.currentTarget;
        setOpen(details.open);
        const target = focusOnOpen.current;
        focusOnOpen.current = null;
        if (details.open && target) focusMenuItem(items(details), target === 'first' ? 0 : -1);
        // Closing while focus is inside (e.g. after a command) must not strand it.
        if (!details.open && details.contains(document.activeElement))
          if (document.activeElement !== trigger.current) trigger.current?.focus();
      }}
    >
      <summary ref={trigger} role="button" aria-label={label} title={label} aria-expanded={open}>
        {Icon && <Icon size={18} />}
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </summary>
      <div
        className="menu-items"
        // Capture runs before the command: focus leaves the list it hides first, so a dialog
        // the command opens restores focus to the visible trigger.
        onClickCapture={(event) => {
          if (!(event.target as Element).closest('button')) return;
          const details = menu.current!;
          if (details.contains(document.activeElement)) trigger.current?.focus();
          details.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
