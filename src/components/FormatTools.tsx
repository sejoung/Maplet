import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Bold, ChevronDown, Eraser, Highlighter, Italic } from 'lucide-react';
import { useI18n } from '../i18n/react';
import type { MindMap } from '../domain/model';
import { HIGHLIGHT_COLORS, HIGHLIGHT_FILLS, type FormatCommand } from '../domain/rich-text';
import { nodesFormat } from '../domain/title-format';
import { HIGHLIGHT_LABELS, setHighlightColor, useHighlightColor } from './highlight-color';
import { useRichEditorBridge, useRichEditorState } from './rich-editor-bridge';

// Pressing a tool must not move focus: the title editor keeps its text selection.
const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Bold, italic and the highlighter in the toolbar. While a title is edited they act on
 * the selected text; otherwise on the whole titles of the selected nodes.
 */
export function FormatTools({
  map,
  selection,
  onFormatNodes,
}: {
  map: MindMap;
  selection: string[];
  onFormatNodes(command: FormatCommand): void;
}) {
  const { t } = useI18n();
  const editor = useRichEditorState(useRichEditorBridge());
  const color = useHighlightColor();
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const format = editor ? editor.format() : nodesFormat(map, selection);
  const run = (command: FormatCommand) => {
    if (editor) editor.apply(command);
    else onFormatNodes(command);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && picker.current?.contains(document.activeElement)) {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  const colorName = t(HIGHLIGHT_LABELS[color]);
  return (
    <div className="toolbar-group format-tools" role="group" aria-label={t('format.menu')}>
      <button
        type="button"
        className="icon-button"
        aria-label={t('format.bold')}
        title={t('format.boldHint')}
        aria-pressed={format?.bold === true}
        disabled={!format}
        onMouseDown={keepFocus}
        onClick={() => run({ kind: 'bold' })}
      >
        <Bold size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('format.italic')}
        title={t('format.italicHint')}
        aria-pressed={format?.italic === true}
        disabled={!format}
        onMouseDown={keepFocus}
        onClick={() => run({ kind: 'italic' })}
      >
        <Italic size={17} />
      </button>
      <div className="highlight-picker" ref={picker}>
        <button
          type="button"
          className="icon-button highlight-apply"
          aria-label={t('format.highlightWith', { color: colorName })}
          title={t('format.highlightHint', { color: colorName })}
          aria-pressed={format?.highlight === color}
          disabled={!format}
          onMouseDown={keepFocus}
          onClick={() => run({ kind: 'highlight', color })}
        >
          <Highlighter size={17} />
          <span className="highlight-bar" style={{ background: HIGHLIGHT_FILLS[color] }} />
        </button>
        <button
          type="button"
          className="icon-button highlight-more"
          aria-label={t('format.chooseHighlight')}
          title={t('format.chooseHighlight')}
          aria-expanded={open}
          onMouseDown={keepFocus}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={13} />
        </button>
        {open && (
          <div className="highlight-popover" role="group" aria-label={t('format.chooseHighlight')}>
            <div className="format-swatches">
              {HIGHLIGHT_COLORS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="format-swatch"
                  aria-label={t(HIGHLIGHT_LABELS[choice])}
                  title={t(HIGHLIGHT_LABELS[choice])}
                  aria-pressed={choice === color}
                  style={{ background: HIGHLIGHT_FILLS[choice] }}
                  onMouseDown={keepFocus}
                  onClick={() => {
                    setHighlightColor(choice);
                    setOpen(false);
                    if (format) run({ kind: 'highlight', color: choice });
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="highlight-clear"
              disabled={!format}
              onMouseDown={keepFocus}
              onClick={() => {
                setOpen(false);
                run({ kind: 'clear' });
              }}
            >
              <Eraser size={15} aria-hidden="true" />
              {t('format.clear')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
