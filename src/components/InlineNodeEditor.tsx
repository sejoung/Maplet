import { useI18n } from '../i18n/react';
import { useLayoutEffect, useRef, useState } from 'react';

export function InlineNodeEditor({
  title,
  lines,
  lineHeight,
  onDraftChange,
  onCommit,
  onCancel,
  onAdd,
}: {
  title: string;
  lines: number;
  lineHeight: number;
  onDraftChange(title: string): void;
  onCommit(title: string, restoreFocus: boolean): boolean;
  onCancel(): void;
  onAdd(): void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(title);
  const input = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  const commit = (restoreFocus = true) => {
    if (finished.current) return true;
    finished.current = true;
    if (!onCommit(value, restoreFocus)) {
      finished.current = false;
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
      return false;
    }
    return true;
  };
  return (
    <textarea
      ref={input}
      className="inline-node-editor"
      aria-label={t('노드 제목')}
      data-inline-editor
      value={value}
      rows={lines}
      style={{ height: lines * lineHeight }}
      maxLength={10000}
      onChange={(event) => {
        setValue(event.target.value);
        onDraftChange(event.target.value);
      }}
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
