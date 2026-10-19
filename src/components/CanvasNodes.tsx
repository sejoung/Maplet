import { useI18n } from '../i18n/react';
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
  type ButtonHTMLAttributes,
} from 'react';
import { Minus, Plus } from 'lucide-react';
import { InlineNodeEditor } from './InlineNodeEditor';
import type { CanvasProps } from './canvas-types';
import { FONT_FAMILIES, nodeTypography } from '../domain/typography';
import type { Layout } from '../engine/layout';

type CanvasNodesProps = Pick<
  CanvasProps,
  | 'map'
  | 'selected'
  | 'editingId'
  | 'onSelect'
  | 'onEdit'
  | 'onRename'
  | 'onCancelEdit'
  | 'onAdd'
  | 'onToggle'
> & {
  layout: Layout;
  resizeHandlers(id: string): ButtonHTMLAttributes<HTMLButtonElement>;
  draggingId?: string;
  viewport: RefObject<HTMLDivElement | null>;
  onKeyDown(event: KeyboardEvent): void;
};

export function readableBackground(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.5 ? value : fallback;
}

export function CanvasNodes(props: CanvasNodesProps) {
  const { t } = useI18n();
  const resizeHelpId = useId();
  const {
    map,
    selected,
    editingId,
    onSelect,
    onEdit,
    onRename,
    onCancelEdit,
    onAdd,
    onToggle,
    layout,
    resizeHandlers,
    draggingId,
    viewport,
    onKeyDown,
  } = props;
  const restoreNodeFocus = (id: string) =>
    requestAnimationFrame(() => {
      const canvas = viewport.current;
      if (!canvas?.querySelector('[data-inline-editor]')) {
        canvas
          ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"][aria-selected="true"]`)
          ?.focus();
      }
    });
  const latestAdd = useRef(onAdd);
  useLayoutEffect(() => {
    latestAdd.current = onAdd;
  }, [onAdd]);
  return (
    <div
      role="tree"
      aria-label={t('마인드맵')}
      aria-multiselectable="false"
      style={{ position: 'absolute', inset: 0 }}
    >
      <span id={resizeHelpId} className="visually-hidden">
        {t('방향키로 크기 조절, Home으로 자동 크기')}
      </span>
      {layout.nodes.map((placed) => {
        const node = map.nodes[placed.id];
        const typography = nodeTypography(node.style);
        let depth = 1;
        let parent = node.parentId;
        while (parent) {
          depth++;
          parent = map.nodes[parent].parentId;
        }
        return (
          <div
            key={node.id}
            className={`mind-node ${node.parentId === null ? 'root-node' : ''} ${node.id === selected ? 'selected' : ''} ${draggingId === node.id ? 'dragging' : ''}`}
            role="treeitem"
            aria-label={node.title}
            aria-level={depth}
            aria-selected={selected === node.id}
            aria-expanded={node.children.length ? !node.collapsed : undefined}
            tabIndex={selected === node.id ? 0 : -1}
            data-node-id={node.id}
            draggable={false}
            style={{
              textAlign: typography.textAlign,
              fontSize: typography.fontSize,
              fontFamily: FONT_FAMILIES[typography.fontFamily],
              lineHeight: `${typography.lineHeight}px`,
              left: placed.x,
              top: placed.y,
              width: placed.width,
              minHeight: placed.height,
              background: readableBackground(
                node.style.background,
                node.parentId === null ? '#e4f0ea' : '#ffffff',
              ),
            }}
            onFocus={() => onSelect(node.id)}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => onEdit(node.id)}
            onKeyDown={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                event.stopPropagation();
                onKeyDown(event);
              }
            }}
            onDragStart={(event) => event.preventDefault()}
          >
            {editingId === node.id ? (
              <InlineNodeEditor
                key={node.id}
                title={node.title}
                onCommit={(title, restoreFocus) => {
                  const saved = onRename(node.id, title);
                  if (saved && restoreFocus) restoreNodeFocus(node.id);
                  return saved;
                }}
                onCancel={() => {
                  onCancelEdit();
                  restoreNodeFocus(node.id);
                }}
                onAdd={() => requestAnimationFrame(() => latestAdd.current())}
              />
            ) : (
              <span className="node-text">
                {placed.lines.map((line, index) => (
                  <span key={index}>{line || '\u00a0'}</span>
                ))}
              </span>
            )}
            {node.notes && <span className="note-indicator" aria-label={t('메모 있음')} />}
            {node.children.length > 0 && (
              <button
                className={`collapse-node ${placed.side}`}
                aria-label={`${node.title} ${node.collapsed ? t('펼치기') : t('접기')}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {node.collapsed ? <Plus size={12} /> : <Minus size={12} />}
              </button>
            )}
            {selected === node.id && editingId !== node.id && (
              <button
                type="button"
                className="resize-node"
                aria-label={t('노드 크기 조절')}
                aria-describedby={resizeHelpId}
                title={t('드래그로 크기 조절 · 더블클릭으로 자동 크기')}
                {...resizeHandlers(node.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
