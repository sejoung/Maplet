import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BoxSelect,
  CaseSensitive,
  Crosshair,
  Eye,
  EyeOff,
  Map as MapIcon,
  Spline,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  CornerDownRight,
  Link2,
  Layers2,
  Layers3,
  Move,
  MessageSquare,
  Palette,
  Focus,
  ListCollapse,
  Plus,
  SquarePlus,
  Redo2,
  Scissors,
  Search,
  Trash2,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { MindMap } from '../../domain/model';
import { nodeCapabilities } from '../../domain/selection';
import type { MenuAction } from './menu-actions';
import type { NodeTool } from '../dialogs/node-tools/NodeToolsDialog';
import { SHORTCUTS } from './shortcuts';

type Translate = (message: string, params?: Record<string, string | number>) => string;

export interface NodeActionHandlers {
  onAdd(sibling?: boolean): void;
  onEdit(id?: string): void;
  onDelete(): void;
  onToggle(id: string): void;
  onSide(id: string, side: 'left' | 'right'): void;
  onCopy(id: string): void;
  onCut(id: string): void;
  onPaste(id: string): void;
  onDuplicate(id: string): void;
  onReorder(id: string, offset: -1 | 1): void;
  openTool(tool: NodeTool): void;
  onFocus(id: string): void;
  onExpandAll(id: string): void;
  canPaste: boolean;
}

export type NodeActionGroups = Record<
  'create' | 'tools' | 'clipboard' | 'arrange' | 'view' | 'remove',
  MenuAction[]
>;

/**
 * Every action on a node, grouped; the toolbar and context menus render from this one list.
 * With several nodes selected, branch commands act on all of them and order commands are off.
 */
export function nodeActionGroups(
  map: MindMap,
  id: string,
  handlers: NodeActionHandlers,
  t: Translate,
  selection: string[] = [id],
): NodeActionGroups {
  const node = map.nodes[id];
  const can = nodeCapabilities(map, id, selection);
  const tool = (tool: NodeTool) => () => handlers.openTool(tool);
  return {
    create: [
      {
        id: 'addChild',
        label: t('common.addChildNode'),
        short: t('toolbar.childNode'),
        icon: CornerDownRight,
        shortcut: SHORTCUTS.addChild,
        run: () => handlers.onAdd(),
      },
      {
        id: 'addSibling',
        label: t('common.addSiblingNode'),
        icon: Plus,
        shortcut: SHORTCUTS.addSibling,
        disabled: !can.canAddSibling,
        run: () => handlers.onAdd(true),
      },
      {
        id: 'editTitle',
        label: t('common.editTitle'),
        icon: CaseSensitive,
        shortcut: SHORTCUTS.editTitle,
        run: () => handlers.onEdit(id),
      },
    ],
    tools: [
      {
        id: 'notes',
        label: node.notes ? t('toolbar.notesWritten') : t('common.notes'),
        short: t('common.notes'),
        marked: Boolean(node.notes),
        icon: MessageSquare,
        run: tool('notes'),
      },
      { id: 'link', label: t('common.link'), icon: Link2, run: tool('link') },
      { id: 'style', label: t('common.style'), icon: Palette, run: tool('style') },
      { id: 'connections', label: t('common.connections'), icon: Spline, run: tool('connections') },
    ],
    clipboard: [
      {
        id: 'copy',
        label: t('menu.copy'),
        icon: Copy,
        shortcut: SHORTCUTS.copy,
        run: () => handlers.onCopy(id),
      },
      {
        id: 'cut',
        label: t('menu.cut'),
        icon: Scissors,
        shortcut: SHORTCUTS.cut,
        disabled: !can.canDelete,
        run: () => handlers.onCut(id),
      },
      {
        id: 'paste',
        label: t('menu.paste'),
        icon: ClipboardPaste,
        shortcut: SHORTCUTS.paste,
        disabled: !handlers.canPaste,
        run: () => handlers.onPaste(id),
      },
      {
        id: 'duplicate',
        label: t('menu.duplicate'),
        icon: CopyPlus,
        shortcut: SHORTCUTS.duplicate,
        disabled: !can.canMoveBranches,
        run: () => handlers.onDuplicate(id),
      },
    ],
    arrange: [
      {
        id: 'moveUp',
        label: t('menu.moveUp'),
        icon: ArrowUp,
        shortcut: SHORTCUTS.moveUp,
        disabled: !can.canMoveUp,
        run: () => handlers.onReorder(id, -1),
      },
      {
        id: 'moveDown',
        label: t('menu.moveDown'),
        icon: ArrowDown,
        shortcut: SHORTCUTS.moveDown,
        disabled: !can.canMoveDown,
        run: () => handlers.onReorder(id, 1),
      },
      {
        id: 'move',
        label: t('common.moveNode'),
        icon: Move,
        disabled: !can.canMoveBranches,
        run: tool('move'),
      },
      {
        id: 'placeLeft',
        label: t('menu.placeLeft'),
        icon: ArrowLeft,
        disabled: !can.canPlace.left,
        run: () => handlers.onSide(id, 'left'),
      },
      {
        id: 'placeRight',
        label: t('menu.placeRight'),
        icon: ArrowRight,
        disabled: !can.canPlace.right,
        run: () => handlers.onSide(id, 'right'),
      },
      {
        id: 'toggle',
        label: node.collapsed ? t('common.expand') : t('common.collapse'),
        icon: node.collapsed ? ChevronsUpDown : ChevronsDownUp,
        disabled: !can.hasChildren,
        run: () => handlers.onToggle(id),
      },
    ],
    view: [
      {
        id: 'focusBranch',
        label: t('menu.showOnlyBranch'),
        icon: Crosshair,
        disabled: !can.hasChildren,
        run: () => handlers.onFocus(id),
      },
      {
        id: 'expandBelow',
        label: t('menu.expandAllBelow'),
        icon: ChevronsUpDown,
        disabled: !can.hasChildren,
        run: () => handlers.onExpandAll(id),
      },
    ],
    remove: [
      {
        id: 'delete',
        label: can.group
          ? t('menu.deleteSelectedNodes', { count: selection.length })
          : t('menu.deleteNode'),
        short: t('toolbar.delete'),
        icon: Trash2,
        shortcut: SHORTCUTS.deleteNode,
        disabled: !can.canDelete,
        danger: true,
        run: handlers.onDelete,
      },
    ],
  };
}

export interface CanvasActionHandlers {
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onPaste(): void;
  canPaste: boolean;
  onSelectAll(): void;
  onSearch(): void;
  onArrange(): void;
  onFit(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  /** Absent where there is no point to place a topic, such as the toolbar. */
  onAddTopic?(): void;
  onLevels(depth: number | null): void;
  focused: boolean;
  onExitFocus(): void;
  minimap: boolean;
  onToggleMinimap(): void;
}
export type CanvasActionGroups = Record<
  'history' | 'edit' | 'levels' | 'display' | 'layout',
  MenuAction[]
>;

/** Map-wide actions for a right-click on empty canvas and the toolbar. */
export function canvasActionGroups(
  handlers: CanvasActionHandlers,
  t: (message: string) => string,
): CanvasActionGroups {
  const levels = (depth: number | null) => () => handlers.onLevels(depth);
  return {
    history: [
      {
        id: 'undo',
        label: t('common.undo'),
        icon: Undo2,
        shortcut: SHORTCUTS.undo,
        disabled: !handlers.canUndo,
        run: handlers.onUndo,
      },
      {
        id: 'redo',
        label: t('common.redo'),
        icon: Redo2,
        shortcut: SHORTCUTS.redo,
        disabled: !handlers.canRedo,
        run: handlers.onRedo,
      },
    ],
    edit: [
      ...(handlers.onAddTopic
        ? [
            {
              id: 'newTopic',
              label: t('menu.newTopicHere'),
              icon: SquarePlus,
              run: handlers.onAddTopic,
            },
          ]
        : []),
      {
        id: 'paste',
        label: t('menu.pasteIntoSelectedNode'),
        icon: ClipboardPaste,
        shortcut: SHORTCUTS.paste,
        disabled: !handlers.canPaste,
        run: handlers.onPaste,
      },
      {
        id: 'selectAll',
        label: t('menu.selectAll'),
        icon: BoxSelect,
        shortcut: SHORTCUTS.selectAll,
        run: handlers.onSelectAll,
      },
      {
        id: 'find',
        label: t('common.find'),
        icon: Search,
        shortcut: SHORTCUTS.find,
        run: handlers.onSearch,
      },
    ],
    levels: [
      { id: 'expandAll', label: t('menu.expandAll'), icon: ChevronsUpDown, run: levels(null) },
      { id: 'mainBranches', label: t('menu.mainBranchesOnly'), icon: ListCollapse, run: levels(2) },
      { id: 'levels2', label: t('menu.show2Levels'), icon: Layers2, run: levels(3) },
      { id: 'levels3', label: t('menu.show3Levels'), icon: Layers3, run: levels(4) },
    ],
    display: [
      ...(handlers.focused
        ? [
            {
              id: 'wholeMap',
              label: t('common.showWholeMap'),
              icon: Eye,
              run: handlers.onExitFocus,
            },
          ]
        : []),
      {
        id: 'minimap',
        label: handlers.minimap ? t('menu.hideMinimap') : t('menu.showMinimap'),
        icon: handlers.minimap ? EyeOff : MapIcon,
        run: handlers.onToggleMinimap,
      },
    ],
    layout: [
      {
        id: 'autoArrange',
        label: t('common.autoArrange'),
        icon: WandSparkles,
        run: handlers.onArrange,
      },
      {
        id: 'fit',
        label: t('common.fitScreen'),
        icon: Focus,
        shortcut: SHORTCUTS.fit,
        run: handlers.onFit,
      },
      {
        id: 'zoomIn',
        label: t('common.zoomIn'),
        icon: ZoomIn,
        shortcut: SHORTCUTS.zoomIn,
        run: handlers.onZoomIn,
      },
      {
        id: 'zoomOut',
        label: t('common.zoomOut'),
        icon: ZoomOut,
        shortcut: SHORTCUTS.zoomOut,
        run: handlers.onZoomOut,
      },
    ],
  };
}
