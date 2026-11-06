import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown, Highlighter } from 'lucide-react';
import { useI18n } from '../i18n/react';
import type { MindMap } from '../domain/model';
import { HIGHLIGHT_COLORS, type FormatCommand } from '../domain/rich-text';
import { HIGHLIGHT_FILLS } from '../engine/render-metrics';
import { nodesFormat } from '../domain/title-format';
import { CLEAR_FORMAT, FORMAT_TOGGLES, HIGHLIGHT_LABELS, swatchProps } from './format-commands';
import { usePreferences } from './preferences';
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
  const [{ highlight: color }, updatePreferences] = usePreferences();
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
      {FORMAT_TOGGLES.map(({ command, icon: Icon, label, hint }) => (
        <button
          key={command.kind}
          type="button"
          className="icon-button"
          aria-label={t(label)}
          title={t(hint)}
          aria-pressed={format?.[command.kind] === true}
          disabled={!format}
          onMouseDown={keepFocus}
          onClick={() => run(command)}
        >
          <Icon size={17} />
        </button>
      ))}
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
                  {...swatchProps(choice, t)}
                  aria-pressed={choice === color}
                  onMouseDown={keepFocus}
                  onClick={() => {
                    updatePreferences({ highlight: choice });
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
                run(CLEAR_FORMAT.command);
              }}
            >
              <CLEAR_FORMAT.icon size={15} aria-hidden="true" />
              {t(CLEAR_FORMAT.label)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
