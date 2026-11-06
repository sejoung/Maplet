import { useState, type DragEvent } from 'react';

/** Opens a file dropped anywhere on the element, showing a drop hint while one is dragged over. */
export function useFileDrop(onOpen: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver(event: DragEvent) {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      },
      onDragLeave(event: DragEvent) {
        // Moving between children fires leave events too; only leaving the element counts.
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      },
      onDrop(event: DragEvent) {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          setDragging(false);
          onOpen(event.dataTransfer.files[0]);
        }
      },
    },
  };
}
