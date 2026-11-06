import { useCallback, useState } from 'react';

/** Branch deletions offer an undo until the next edit makes it ambiguous. */
export function useDeletedNotice() {
  const [count, setCount] = useState<number | null>(null);
  const clear = useCallback(() => setCount(null), []);
  return {
    show: setCount as (count: number) => void,
    clear,
    /** The notice for the editor, whose undo button runs `undo`. */
    notice: (undo: () => void) =>
      count === null
        ? null
        : {
            message: { key: 'app.nodesDeleted', params: { count } },
            onUndo: undo,
            onDismiss: clear,
          },
  };
}
