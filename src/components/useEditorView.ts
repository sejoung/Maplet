import { useEffect, useState, type RefObject } from 'react';
import { isDescendant } from '../domain/commands';
import { visibleSelection } from '../domain/selection';
import { useI18n } from '../i18n/react';
import { canvasActionGroups, nodeActionGroups } from './node-actions';
import type { NodeTool } from './NodeToolsDialog';
import type { CanvasControls } from './canvas-types';
import type { EditorProps } from './editor-types';
import { useAutoArrange } from './useAutoArrange';
import { useFind } from './useFind';

const MINIMAP_KEY = 'maplet:minimap';
const readMinimap = () => {
  try {
    return localStorage.getItem(MINIMAP_KEY) !== 'off';
  } catch {
    return true;
  }
};
const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest('input,textarea,select,[contenteditable=true]'));

/**
 * What the editor shows around the document: the focused branch, the minimap, the find bar,
 * map-wide shortcuts, and the node and canvas menu actions.
 */
export function useEditorView(
  props: EditorProps,
  controls: RefObject<CanvasControls | null>,
  openTool: (tool: NodeTool) => void,
) {
  const { t } = useI18n();
  const { map, selected } = props;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [minimap, setMinimap] = useState(readMinimap);
  const find = useFind(map, selected, props.onSelect);
  // Focus ends when its branch is deleted or the selection leaves it (undo, find, menus).
  const focus =
    focusId &&
    Object.hasOwn(map.nodes, focusId) &&
    (selected === focusId || isDescendant(map, focusId, selected))
      ? focusId
      : null;
  useEffect(() => {
    if (focusId && !focus) setFocusId(null);
  }, [focusId, focus]);
  const arrangeMap = useAutoArrange(map, props.onAutoLayout, controls);
  // Canvas apps zoom the document, not the browser page, with Ctrl/⌘ +, − and 0, and find
  // nodes rather than page text with Ctrl/⌘ F.
  const { show: showFind } = find;
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'f' && !event.shiftKey) {
        if ((event.target as Element | null)?.closest?.('[data-inline-editor]')) return;
        event.preventDefault();
        showFind();
        return;
      }
      if (editable(event.target)) return;
      const view = controls.current;
      const run = { '=': view?.zoomIn, '+': view?.zoomIn, '-': view?.zoomOut, '0': view?.fit }[
        event.key
      ];
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [controls, showFind]);
  // Menu commands have no clipboard event, so they also offer the text to other apps.
  const share = (text: string | null) => {
    if (text) void navigator.clipboard?.writeText(text).catch(() => {});
  };
  const actions = nodeActionGroups(
    map,
    selected,
    {
      onAdd: props.onAdd,
      onEdit: (id) => props.onEdit(id),
      onDelete: props.onDelete,
      onToggle: props.onToggle,
      onSide: (id, side) => props.onUpdate(id, { side }),
      onCopy: (id) => share(props.onCopyNode(id)),
      onCut: (id) => share(props.onCutNode(id)),
      onPaste: (id) => props.onPasteNode(id),
      onDuplicate: props.onDuplicateNode,
      onReorder: props.onReorder,
      openTool,
      onFocus: setFocusId,
      onExpandAll: (id) => props.onShowLevels(null, id),
      canPaste: props.canPaste,
    },
    t,
    props.selection,
  );
  /** Canvas actions; a screen point adds "new topic here". */
  const canvasActions = (at?: { x: number; y: number }) =>
    canvasActionGroups(
      {
        onUndo: props.onUndo,
        onRedo: props.onRedo,
        canUndo: props.canUndo,
        canRedo: props.canRedo,
        onPaste: () => props.onPasteNode(selected),
        canPaste: props.canPaste,
        onSelectAll: () =>
          props.onSelectNodes(visibleSelection(map, Object.keys(map.nodes)), selected),
        onSearch: find.show,
        onArrange: arrangeMap,
        onFit: () => controls.current?.fit(),
        onZoomIn: () => controls.current?.zoomIn(),
        onZoomOut: () => controls.current?.zoomOut(),
        onAddTopic: at && (() => props.onAddRoot(controls.current?.toMap(at.x, at.y))),
        onLevels: (depth) => props.onShowLevels(depth),
        focused: Boolean(focus),
        onExitFocus: () => setFocusId(null),
        minimap,
        onToggleMinimap: () =>
          setMinimap((shown) => {
            try {
              localStorage.setItem(MINIMAP_KEY, shown ? 'off' : 'on');
            } catch {
              // The choice still applies for this visit.
            }
            return !shown;
          }),
      },
      t,
    );
  return {
    focus,
    exitFocus: () => setFocusId(null),
    minimap,
    find,
    actions,
    canvasActions,
    arrangeMap,
  };
}
