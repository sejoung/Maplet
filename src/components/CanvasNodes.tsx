import { useI18n } from '../i18n/react';
import { useId, useMemo, type ButtonHTMLAttributes, type RefObject } from 'react';
import { depthOf } from '../domain/tree';
import type { DropIndicator } from '../engine/branch-drag';
import type { Layout } from '../engine/layout';
import type { CanvasProps } from './canvas-types';
import { focusNodeLater } from './canvas-dom';
import { MindNode, type NodeActions } from './MindNode';
import { useLatest } from './useLatest';

type ActionProps = Pick<
  CanvasProps,
  | 'selected'
  | 'selection'
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
> & {
  viewport: RefObject<HTMLElement | null>;
  onDraftChange(id: string, title: string): void;
  resizeHandle(id: string): ButtonHTMLAttributes<HTMLButtonElement>;
};

/** The canvas's answers to node events, stable for the canvas's lifetime. */
export function useNodeActions(props: ActionProps): NodeActions {
  const latest = useLatest(props);
  return useMemo(() => {
    const current = () => latest.current;
    const withinCanvas = () => current().viewport.current;
    // After an edit, focus returns to the node unless another editor took it meanwhile.
    const restoreFocus = (id: string) =>
      focusNodeLater(id, {
        root: withinCanvas,
        preventScroll: true,
        selected: true,
        unlessEditing: true,
      });
    return {
      focus(id) {
        const { selection, selected, onSelect, onSelectNodes } = current();
        if (!selection.includes(id)) onSelect(id);
        else if (id !== selected) onSelectNodes(selection, id);
      },
      click(id, additive) {
        if (!additive) return current().onSelect(id);
        current().onToggleSelect(id);
        focusNodeLater(null, { root: withinCanvas, preventScroll: true });
      },
      edit: (id) => current().onEdit(id),
      contextMenu: (id, at) => current().onContextMenu(id, at),
      toggle: (id) => current().onToggle(id),
      toggleTask: (id) => current().onToggleTask(id),
      draftChange: (id, title) => current().onDraftChange(id, title),
      commit(id, title, refocus) {
        const saved = current().onRename(id, title);
        if (saved && refocus) restoreFocus(id);
        return saved;
      },
      cancelEdit(id, refocus) {
        current().onCancelEdit();
        if (refocus) restoreFocus(id);
      },
      addNext: () => requestAnimationFrame(() => current().onAdd()),
      resizeHandle: (id) => current().resizeHandle(id),
    };
  }, [latest]);
}

/** Every visible node, as an accessible tree. */
export function CanvasNodes({
  map,
  layout,
  selected,
  selection,
  editingId,
  dragging,
  drop,
  matches,
  actions,
}: Pick<CanvasProps, 'map' | 'selected' | 'selection' | 'editingId' | 'matches'> & {
  layout: Layout;
  dragging?: string[];
  drop: DropIndicator | null;
  actions: NodeActions;
}) {
  const { t } = useI18n();
  const resizeHelpId = useId();
  const chosen = useMemo(() => new Set(selection), [selection]);
  const dragged = useMemo(() => new Set(dragging), [dragging]);
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
      {layout.nodes.map(({ id, x, y, width, height, side, runs }) => (
        <MindNode
          key={id}
          node={map.nodes[id]}
          x={x}
          y={y}
          width={width}
          height={height}
          side={side}
          runs={runs}
          depth={depthOf(map, id)}
          focused={selected === id}
          chosen={chosen.has(id)}
          multi={chosen.has(id) && selection.length > 1}
          editing={editingId === id}
          dragging={dragged.has(id)}
          drop={drop?.node === id ? (drop.kind === 'child' ? 'child' : 'sibling') : null}
          match={Boolean(matches?.has(id))}
          resizable={selected === id && selection.length === 1 && editingId !== id}
          resizeHelpId={resizeHelpId}
          actions={actions}
        />
      ))}
    </div>
  );
}
