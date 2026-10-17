import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ToolbarMenu({
  label,
  icon,
  children,
  className = '',
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeMenus = (event: Event) => {
      if (
        menu.current &&
        (event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !menu.current.contains(event.target as Node))
      )
        menu.current.open = false;
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);
  return (
    <details ref={menu} className={`toolbar-menu ${className}`}>
      <summary role="button" aria-label={label} title={label}>
        {icon}
        <span>{label}</span>
        <ChevronDown size={12} />
      </summary>
      <div className="menu-items">{children}</div>
    </details>
  );
}
