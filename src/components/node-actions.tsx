import type { ReactNode } from 'react';
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
  ListTree,
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
import type { MindMap } from '../domain/model';
import { canDeleteNodes, topLevel } from '../domain/selection';
import type { NodeTool } from './NodeToolsDialog';

export interface NodeAction {
  label: string;
  icon: ReactNode;
  /** Shown as a hint; announced through aria-keyshortcuts instead of the name. */
  shortcut?: { label: string; aria: string };
  disabled?: boolean;
  danger?: boolean;
  run(): void;
}

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

const mod = (key: string) => ({ label: `Ctrl/⌘ ${key}`, aria: `Control+${key} Meta+${key}` });

export type NodeActionGroups = Record<
  'create' | 'tools' | 'clipboard' | 'arrange' | 'view' | 'remove',
  NodeAction[]
>;

/**
 * Every action on a node, grouped; the toolbar and context menus render from this one list.
 * With several nodes selected, branch commands act on all of them and order commands are off.
 */
export function nodeActionGroups(
  map: MindMap,
  id: string,
  handlers: NodeActionHandlers,
  t: (message: string, params?: Record<string, string | number>) => string,
  selection: string[] = [id],
): NodeActionGroups {
  const node = map.nodes[id];
  const root = node.parentId === null;
  const group = selection.length > 1;
  const branches = group ? topLevel(map, selection) : [id];
  const children = branches.filter((key) => map.nodes[key].parentId !== null);
  const siblings = root
    ? []
    : map.nodes[node.parentId!].children.filter((key) => map.nodes[key].side === node.side);
  const index = siblings.indexOf(id);
  const undeletable = !canDeleteNodes(map, branches);
  const onSide = (side: 'left' | 'right') => children.every((key) => map.nodes[key].side === side);
  return {
    create: [
      {
        label: t('common.addChildNode'),
        icon: <CornerDownRight size={17} />,
        shortcut: { label: 'Tab', aria: 'Tab' },
        run: () => handlers.onAdd(),
      },
      {
        label: t('common.addSiblingNode'),
        icon: <Plus size={17} />,
        shortcut: { label: 'Enter', aria: 'Enter' },
        disabled: root,
        run: () => handlers.onAdd(true),
      },
      {
        label: t('common.editTitle'),
        icon: <CaseSensitive size={17} />,
        shortcut: { label: 'F2', aria: 'F2' },
        run: () => handlers.onEdit(id),
      },
    ],
    tools: [
      {
        label: t('common.notes'),
        icon: <MessageSquare size={17} />,
        run: () => handlers.openTool('notes'),
      },
      { label: t('common.link'), icon: <Link2 size={17} />, run: () => handlers.openTool('link') },
      {
        label: t('common.style'),
        icon: <Palette size={17} />,
        run: () => handlers.openTool('style'),
      },
      {
        label: t('common.connections'),
        icon: <Spline size={17} />,
        run: () => handlers.openTool('connections'),
      },
    ],
    clipboard: [
      {
        label: t('menu.copy'),
        icon: <Copy size={17} />,
        shortcut: mod('C'),
        run: () => handlers.onCopy(id),
      },
      {
        label: t('menu.cut'),
        icon: <Scissors size={17} />,
        shortcut: mod('X'),
        disabled: undeletable,
        run: () => handlers.onCut(id),
      },
      {
        label: t('menu.paste'),
        icon: <ClipboardPaste size={17} />,
        shortcut: mod('V'),
        disabled: !handlers.canPaste,
        run: () => handlers.onPaste(id),
      },
      {
        label: t('menu.duplicate'),
        icon: <CopyPlus size={17} />,
        shortcut: mod('D'),
        disabled: !children.length,
        run: () => handlers.onDuplicate(id),
      },
    ],
    arrange: [
      {
        label: t('menu.moveUp'),
        icon: <ArrowUp size={17} />,
        shortcut: { label: 'Alt ↑', aria: 'Alt+ArrowUp' },
        disabled: group || index < 1,
        run: () => handlers.onReorder(id, -1),
      },
      {
        label: t('menu.moveDown'),
        icon: <ArrowDown size={17} />,
        shortcut: { label: 'Alt ↓', aria: 'Alt+ArrowDown' },
        disabled: group || root || index === siblings.length - 1,
        run: () => handlers.onReorder(id, 1),
      },
      {
        label: t('common.moveNode'),
        icon: <ListTree size={17} />,
        disabled: !children.length,
        run: () => handlers.openTool('move'),
      },
      {
        label: t('menu.placeLeft'),
        icon: <ArrowLeft size={17} />,
        disabled: onSide('left'),
        run: () => handlers.onSide(id, 'left'),
      },
      {
        label: t('menu.placeRight'),
        icon: <ArrowRight size={17} />,
        disabled: onSide('right'),
        run: () => handlers.onSide(id, 'right'),
      },
      {
        label: node.collapsed ? t('common.expand') : t('common.collapse'),
        icon: node.collapsed ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onToggle(id),
      },
    ],
    view: [
      {
        label: t('menu.showOnlyBranch'),
        icon: <Crosshair size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onFocus(id),
      },
      {
        label: t('menu.expandAllBelow'),
        icon: <ChevronsUpDown size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onExpandAll(id),
      },
    ],
    remove: [
      {
        label: group
          ? t('menu.deleteSelectedNodes', { count: selection.length })
          : t('menu.deleteNode'),
        icon: <Trash2 size={17} />,
        shortcut: { label: 'Delete', aria: 'Delete' },
        disabled: undeletable,
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
  NodeAction[]
>;

/** Map-wide actions for a right-click on empty canvas and the toolbar View menu. */
export function canvasActionGroups(
  handlers: CanvasActionHandlers,
  t: (message: string) => string,
): CanvasActionGroups {
  return {
    history: [
      {
        label: t('common.undo'),
        icon: <Undo2 size={17} />,
        shortcut: mod('Z'),
        disabled: !handlers.canUndo,
        run: handlers.onUndo,
      },
      {
        label: t('common.redo'),
        icon: <Redo2 size={17} />,
        shortcut: { label: 'Ctrl/⌘ Shift Z', aria: 'Control+Shift+Z Meta+Shift+Z' },
        disabled: !handlers.canRedo,
        run: handlers.onRedo,
      },
    ],
    edit: [
      ...(handlers.onAddTopic
        ? [
            {
              label: t('menu.newTopicHere'),
              icon: <SquarePlus size={17} />,
              run: handlers.onAddTopic,
            },
          ]
        : []),
      {
        label: t('menu.pasteIntoSelectedNode'),
        icon: <ClipboardPaste size={17} />,
        shortcut: mod('V'),
        disabled: !handlers.canPaste,
        run: handlers.onPaste,
      },
      {
        label: t('menu.selectAll'),
        icon: <BoxSelect size={17} />,
        shortcut: mod('A'),
        run: handlers.onSelectAll,
      },
      {
        label: t('common.find'),
        icon: <Search size={17} />,
        shortcut: mod('F'),
        run: handlers.onSearch,
      },
    ],
    levels: [
      {
        label: t('menu.expandAll'),
        icon: <ChevronsUpDown size={17} />,
        run: () => handlers.onLevels(null),
      },
      {
        label: t('menu.mainBranchesOnly'),
        icon: <ListCollapse size={17} />,
        run: () => handlers.onLevels(2),
      },
      {
        label: t('menu.show2Levels'),
        icon: <ListTree size={17} />,
        run: () => handlers.onLevels(3),
      },
      {
        label: t('menu.show3Levels'),
        icon: <ListTree size={17} />,
        run: () => handlers.onLevels(4),
      },
    ],
    display: [
      ...(handlers.focused
        ? [{ label: t('common.showWholeMap'), icon: <Eye size={17} />, run: handlers.onExitFocus }]
        : []),
      {
        label: handlers.minimap ? t('menu.hideMinimap') : t('menu.showMinimap'),
        icon: handlers.minimap ? <EyeOff size={17} /> : <MapIcon size={17} />,
        run: handlers.onToggleMinimap,
      },
    ],
    layout: [
      { label: t('common.autoArrange'), icon: <WandSparkles size={17} />, run: handlers.onArrange },
      {
        label: t('common.fitScreen'),
        icon: <Focus size={17} />,
        shortcut: mod('0'),
        run: handlers.onFit,
      },
      {
        label: t('common.zoomIn'),
        icon: <ZoomIn size={17} />,
        shortcut: mod('+'),
        run: handlers.onZoomIn,
      },
      {
        label: t('common.zoomOut'),
        icon: <ZoomOut size={17} />,
        shortcut: mod('-'),
        run: handlers.onZoomOut,
      },
    ],
  };
}

/** Menu rows for one action list; `role` distinguishes toolbar menus from a context menu. */
export function NodeActionItems({
  groups,
  wrap,
  role,
}: {
  groups: NodeAction[][];
  wrap(action: () => void): () => void;
  role?: 'menuitem';
}) {
  return groups.map((group, index) => (
    <div key={index} role={role ? 'group' : undefined} className="action-group">
      {index > 0 && <hr />}
      {group.map((action) => (
        <button
          key={action.label}
          type="button"
          role={role}
          className={action.danger ? 'danger-quiet' : undefined}
          disabled={action.disabled}
          aria-keyshortcuts={action.shortcut?.aria}
          onClick={wrap(action.run)}
        >
          {action.icon}
          {action.label}
          {action.shortcut && <kbd aria-hidden="true">{action.shortcut.label}</kbd>}
        </button>
      ))}
    </div>
  ));
}
