import { useState, type FocusEvent } from 'react';
import { TEXT_EDITOR_SELECTOR } from './canvas-dom';

/**
 * Whether a title or file-name editor inside the element has focus; the sync indicator
 * words its state differently while the user is typing.
 */
export function useTextEditorFocus() {
  const [editing, setEditing] = useState(false);
  return {
    editing,
    handlers: {
      onFocusCapture: (event: FocusEvent) =>
        setEditing((event.target as Element).matches(TEXT_EDITOR_SELECTOR)),
      onBlurCapture: (event: FocusEvent) => {
        if ((event.target as Element).matches(TEXT_EDITOR_SELECTOR)) setEditing(false);
      },
    },
  };
}
