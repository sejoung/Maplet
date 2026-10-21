import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useI18n } from '../i18n/react';
import type { FindState } from './useFind';

/** A find bar over the canvas: matches are highlighted, Enter and Shift+Enter step through. */
export function FindBar({ find, onClose }: { find: FindState; onClose(): void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="find-bar" role="search" aria-label={t('canvas.findNodes')}>
      <Search size={16} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label={t('canvas.searchNodes')}
        placeholder={t('canvas.enterSearchText')}
        value={find.query}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) find.previous();
            else find.next();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <output className="find-count" aria-live="polite">
        {find.query.trim()
          ? find.count
            ? `${find.position}/${find.count}`
            : t('canvas.noResults')
          : ''}
      </output>
      <button
        type="button"
        className="icon-button"
        aria-label={t('canvas.previousResult')}
        title={t('canvas.previousResultShiftEnter')}
        disabled={!find.count}
        onClick={find.previous}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('canvas.nextResult')}
        title={t('canvas.nextResultEnter')}
        disabled={!find.count}
        onClick={find.next}
      >
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('canvas.closeFind')}
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}
