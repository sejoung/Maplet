import { useLayoutEffect, useRef, useState } from 'react';

export function InlineNodeEditor({
  title,
  onCommit,
  onCancel,
  onAdd,
}: {
  title: string;
  onCommit(title: string, restoreFocus: boolean): boolean;
  onCancel(): void;
  onAdd(): void;
}) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const commit = (restoreFocus = true) => {
    if (finished.current) return true;
    finished.current = true;
    if (!onCommit(value, restoreFocus)) {
      finished.current = false;
      requestAnimationFrame(() => input.current?.focus());
      return false;
    }
    return true;
  };
  return (
    <textarea
      ref={input}
      className="inline-node-editor"
      aria-label="노드 제목"
      data-inline-editor
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      maxLength={10000}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => commit(false)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey) return;
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finished.current = true;
          onCancel();
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
        } else if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          if (commit(false)) onAdd();
        }
      }}
    />
  );
}
