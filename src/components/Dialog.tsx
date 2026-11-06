import { useI18n } from '../i18n/react';
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react';
import { X } from 'lucide-react';
import { useLatest } from './useLatest';

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers may pass inline handlers; focus setup must still run only on open and close.
  const close = useLatest(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const controls = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]',
      ),
    ];
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? controls()[0] ?? dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const items = controls();
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    dialog.addEventListener('keydown', key);
    return () => {
      dialog.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label={t('editor.closeDialog')} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A dialog's closing buttons: Cancel (when offered) then the named action. Without
 * `onSubmit` the action submits the surrounding form.
 */
export function DialogActions({
  submitLabel,
  onSubmit,
  disabled = false,
  danger = false,
  onCancel,
  cancelLabel,
  cancelRef,
  focusCancel = false,
}: {
  submitLabel: string;
  onSubmit?(): void;
  disabled?: boolean;
  danger?: boolean;
  onCancel?(): void;
  cancelLabel?: string;
  cancelRef?: Ref<HTMLButtonElement>;
  /** Cancel takes the focus when the dialog opens, so Enter is safe. */
  focusCancel?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="dialog-actions">
      {onCancel && (
        <button
          ref={cancelRef}
          type="button"
          className="button"
          data-autofocus={focusCancel || undefined}
          onClick={onCancel}
        >
          {cancelLabel ?? t('common.cancel')}
        </button>
      )}
      <button
        type={onSubmit ? 'button' : 'submit'}
        className={`button ${danger ? 'danger' : 'primary'}`}
        disabled={disabled}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
