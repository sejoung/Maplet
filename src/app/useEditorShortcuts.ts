import { useCallback, useEffect } from 'react';
import { useLatest } from '../components/shared/useLatest';
import { TEXT_EDITOR_SELECTOR } from '../components/canvas/canvas-dom';

interface Shortcuts {
  save(): void;
  undo(): void;
  redo(): void;
  help(): void;
}
export function useEditorShortcuts(actions: Shortcuts) {
  const latest = useLatest(actions);
  const save = useCallback(() => {
    const editor = document.activeElement as HTMLElement | null;
    if (editor?.matches(TEXT_EDITOR_SELECTOR)) {
      editor.blur();
      requestAnimationFrame(() => {
        if (!document.querySelector(TEXT_EDITOR_SELECTOR)) latest.current.save();
      });
    } else latest.current.save();
  }, [latest]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const input = (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable]:not([contenteditable=false])',
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
  }, [save, latest]);
  return save;
}
