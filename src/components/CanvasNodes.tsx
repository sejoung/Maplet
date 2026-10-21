import { useI18n } from '../i18n/react';
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { Check, ExternalLink, Minus, Plus, StickyNote } from 'lucide-react';
import { safeUrl } from '../domain/commands';
import { InlineNodeEditor } from './InlineNodeEditor';
import type { CanvasProps } from './canvas-types';
import { FONT_FAMILIES, nodeTypography } from '../domain/typography';
import { NODE_PADDING_X, NODE_PADDING_Y } from '../domain/node-size';
import type { Layout } from '../engine/layout';
import type { DropTarget } from '../engine/branch-drag';
import { nodeMarkers } from '../domain/node-markers';
import { nodeBorder, readableBackground } from '../domain/node-colors';

type CanvasNodesProps = Pick<
  CanvasProps,
  | 'map'
  | 'selected'
  | 'selection'
  | 'editingId'
  | 'onSelect'
  | 'onToggleSelect'
  | 'onSelectNodes'
  | 'onEdit'
  | 'onRename'
  | 'onCancelEdit'
  | 'onAdd'
  | 'onToggle'
  | 'onContextMenu'
  | 'onToggleTask'
  | 'matches'
> & {
  layout: Layout;
  onDraftChange(id: string, title: string): void;
  resizeHandlers(id: string): ButtonHTMLAttributes<HTMLButtonElement>;
  dragging?: string[];
  dropTarget?: DropTarget | null;
  viewport: RefObject<HTMLDivElement | null>;
  onKeyDown(event: KeyboardEvent): void;
};

const additive = (event: MouseEvent) => event.shiftKey || event.metaKey || event.ctrlKey;

export function CanvasNodes(props: CanvasNodesProps) {
  const { t } = useI18n();
  const resizeHelpId = useId();
  const {
    map,
    selected,
    selection,
    editingId,
    onSelect,
    onToggleSelect,
    onSelectNodes,
    onEdit,
    onRename,
    onCancelEdit,
    onAdd,
    onToggle,
    onContextMenu,
    layout,
    onDraftChange,
    resizeHandlers,
    dragging,
    dropTarget,
    matches,
    onToggleTask,
    viewport,
    onKeyDown,
  } = props;
  const restoreNodeFocus = (id: string) =>
    requestAnimationFrame(() => {
      const canvas = viewport.current;
      if (!canvas?.querySelector('[data-inline-editor]')) {
        canvas
          ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"][aria-selected="true"]`)
          ?.focus({ preventScroll: true });
      }
    });
  const latestAdd = useRef(onAdd);
  useLayoutEffect(() => {
    latestAdd.current = onAdd;
  }, [onAdd]);
  return (
    <div
      role="tree"
      aria-label={t('canvas.mindMap')}
      aria-multiselectable="true"
      style={{ position: 'absolute', inset: 0 }}
    >
      <span id={resizeHelpId} className="visually-hidden">
        {t('canvas.resizeKeysHint')}
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
        const chosen = selection.includes(node.id);
        const markers = nodeMarkers(node.style, typography.fontSize);
        const border = nodeBorder(node.style);
        const custom = readableBackground(node.style.background, '');
        const dropping = dropTarget?.node === node.id ? dropTarget.place : null;
        const classes = [
          'mind-node',
          node.parentId === null && 'root-node',
          chosen && 'selected',
          chosen && selection.length > 1 && 'multi',
          dragging?.includes(node.id) && 'dragging',
          dropping === 'child' && 'drop-target',
          dropping && dropping !== 'child' && 'drop-sibling',
          matches?.has(node.id) && 'search-match',
          markers.task === 'done' && 'task-done',
          custom && 'custom-bg',
        ];
        return (
          <div
            key={node.id}
            className={classes.filter(Boolean).join(' ')}
            role="treeitem"
            aria-label={node.title}
            aria-level={depth}
            aria-selected={chosen}
            data-drop-label={dropping === 'child' ? t('canvas.moveHere') : undefined}
            aria-expanded={node.children.length ? !node.collapsed : undefined}
            tabIndex={selected === node.id ? 0 : -1}
            data-node-id={node.id}
            draggable={false}
            style={
              {
                '--node-padding-x': `${NODE_PADDING_X}px`,
                '--node-padding-y': `${NODE_PADDING_Y}px`,
                textAlign: typography.textAlign,
                fontSize: typography.fontSize,
                fontFamily: FONT_FAMILIES[typography.fontFamily],
                fontWeight: typography.bold ? 700 : undefined,
                fontStyle: typography.italic ? 'italic' : undefined,
                '--node-border-color': border ?? undefined,
                lineHeight: `${typography.lineHeight}px`,
                left: placed.x,
                top: placed.y,
                width: placed.width,
                minHeight: placed.height,
                // Default colors come from the theme; chosen pastel colors stay as they are.
                background: custom || undefined,
              } as CSSProperties
            }
            onFocus={() => {
              if (!chosen) onSelect(node.id);
              else if (node.id !== selected) onSelectNodes(selection, node.id);
            }}
            onMouseDown={(event) => {
              // Keep focus where it is so the click can extend the selection instead.
              if (additive(event)) event.preventDefault();
            }}
            onClick={(event) => {
              if (!additive(event)) return onSelect(node.id);
              onToggleSelect(node.id);
              requestAnimationFrame(() =>
                viewport.current
                  ?.querySelector<HTMLElement>('[data-node-id][tabindex="0"]')
                  ?.focus({ preventScroll: true }),
              );
            }}
            onDoubleClick={() => onEdit(node.id)}
            onKeyDown={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                event.stopPropagation();
                onKeyDown(event);
              }
            }}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => {
              if (editingId === node.id) return;
              event.preventDefault();
              // A keyboard-opened menu reports no pointer; anchor it below the node instead.
              const rect = event.currentTarget.getBoundingClientRect();
              const keyboard = event.clientX === 0 && event.clientY === 0;
              onContextMenu(
                node.id,
                keyboard
                  ? { x: rect.left + 8, y: rect.bottom + 4 }
                  : { x: event.clientX, y: event.clientY },
              );
            }}
          >
            {(markers.task || markers.icon) && (
              <span className="node-markers" style={{ width: markers.width }}>
                {markers.task && (
                  <button
                    type="button"
                    className="node-task"
                    role="checkbox"
                    aria-checked={markers.task === 'done'}
                    aria-label={t('canvas.taskDone', { title: node.title })}
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTask(node.id);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    {markers.task === 'done' && <Check size={12} strokeWidth={3} />}
                  </button>
                )}
                {markers.icon && (
                  <span
                    className="node-icon"
                    aria-hidden="true"
                    style={{ width: markers.iconSize, fontSize: typography.fontSize }}
                  >
                    {markers.icon}
                  </span>
                )}
              </span>
            )}
            {editingId === node.id ? (
              <InlineNodeEditor
                key={node.id}
                title={node.title}
                lines={placed.lines.length}
                lineHeight={typography.lineHeight}
                onDraftChange={(title) => onDraftChange(node.id, title)}
                onCommit={(title, restoreFocus) => {
                  const saved = onRename(node.id, title);
                  if (saved && restoreFocus) restoreNodeFocus(node.id);
                  return saved;
                }}
                onCancel={(restoreFocus) => {
                  onCancelEdit();
                  if (restoreFocus) restoreNodeFocus(node.id);
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
            {(node.notes || node.links[0]) && (
              <span className="node-badges">
                {node.notes && (
                  <span
                    className="node-badge"
                    role="img"
                    aria-label={t('canvas.hasNotes')}
                    title={node.notes.length > 200 ? `${node.notes.slice(0, 200)}…` : node.notes}
                  >
                    <StickyNote size={11} aria-hidden="true" />
                  </span>
                )}
                {node.links[0] && safeUrl(node.links[0]) && (
                  <a
                    className="node-badge"
                    href={node.links[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={-1}
                    aria-label={`${t('canvas.openLink')}: ${node.links[0]}`}
                    title={node.links[0]}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
              </span>
            )}
            {node.children.length > 0 && (
              <button
                className={`collapse-node ${placed.side}`}
                aria-label={`${node.title} ${node.collapsed ? t('common.expand') : t('common.collapse')}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {node.collapsed ? <Plus size={12} /> : <Minus size={12} />}
              </button>
            )}
            {selected === node.id && selection.length === 1 && editingId !== node.id && (
              <button
                type="button"
                className="resize-node"
                aria-label={t('common.resizeNode')}
                aria-describedby={resizeHelpId}
                title={t('canvas.resizeHint')}
                {...resizeHandlers(node.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
