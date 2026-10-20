import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

interface Shortcuts {
  save(): void;
  undo(): void;
  redo(): void;
  help(): void;
}
export function useEditorShortcuts(actions: Shortcuts) {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  const save = useCallback(() => {
    const editor = document.activeElement as HTMLElement | null;
    if (editor?.matches('[data-inline-editor],[data-filename-editor]')) {
      editor.blur();
      requestAnimationFrame(() => {
        if (!document.querySelector('[data-inline-editor],[data-filename-editor]'))
          latest.current.save();
      });
    } else latest.current.save();
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const input = (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable=true]',
      );
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        save();
      }
      if (!input && modifier && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) latest.current.redo();
        else latest.current.undo();
      }
      if (!input && event.key === '?') latest.current.help();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [save]);
  return save;
}
