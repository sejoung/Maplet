import { useLayoutEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { renameFilename } from '../application/document-name';
import { useI18n } from '../i18n/react';

export function DocumentName({
  filename,
  onChange,
}: {
  filename: string;
  onChange(name: string): void;
}) {
  const { t } = useI18n();
  const name = filename.replace(/\.(maplet|mup)$/i, '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  const finish = (cancel = false, validate = false) => {
    if (closed.current) return;
    if (!cancel) {
      try {
        onChange(renameFilename(draft));
      } catch {
        if (validate) {
          input.current?.setCustomValidity(t('파일 이름을 입력해 주세요.'));
          input.current?.reportValidity();
          return;
        }
      }
    }
    closed.current = true;
    setEditing(false);
    if (cancel || validate)
      requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  };
  return editing ? (
    <span className="filename-editor">
      <input
        ref={input}
        aria-label={t('파일 이름')}
        data-filename-editor
        value={draft}
        maxLength={200}
        required
        onChange={(event) => {
          setDraft(event.target.value);
          event.currentTarget.setCustomValidity('');
        }}
        onBlur={() => finish()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === 'Escape', true);
          }
        }}
      />
      <span className="filename-extension" aria-hidden="true">
        .maplet
      </span>
    </span>
  ) : (
    <button
      ref={button}
      type="button"
      className="filename-button"
      aria-label={`${t('파일 이름 변경')}: ${name}`}
      title={t('파일 이름 변경')}
      onClick={() => {
        closed.current = false;
        setDraft(name);
        setEditing(true);
      }}
    >
      <span>{name}</span>
      <Pencil size={12} aria-hidden="true" />
    </button>
  );
}
