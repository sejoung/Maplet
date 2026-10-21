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
        label: t('하위 노드 추가'),
        icon: <CornerDownRight size={17} />,
        shortcut: { label: 'Tab', aria: 'Tab' },
        run: () => handlers.onAdd(),
      },
      {
        label: t('형제 노드 추가'),
        icon: <Plus size={17} />,
        shortcut: { label: 'Enter', aria: 'Enter' },
        disabled: root,
        run: () => handlers.onAdd(true),
      },
      {
        label: t('제목 편집'),
        icon: <CaseSensitive size={17} />,
        shortcut: { label: 'F2', aria: 'F2' },
        run: () => handlers.onEdit(id),
      },
    ],
    tools: [
      {
        label: t('메모'),
        icon: <MessageSquare size={17} />,
        run: () => handlers.openTool('notes'),
      },
      { label: t('링크'), icon: <Link2 size={17} />, run: () => handlers.openTool('link') },
      { label: t('서식'), icon: <Palette size={17} />, run: () => handlers.openTool('style') },
      {
        label: t('연결선'),
        icon: <Spline size={17} />,
        run: () => handlers.openTool('connections'),
      },
    ],
    clipboard: [
      {
        label: t('복사'),
        icon: <Copy size={17} />,
        shortcut: mod('C'),
        run: () => handlers.onCopy(id),
      },
      {
        label: t('잘라내기'),
        icon: <Scissors size={17} />,
        shortcut: mod('X'),
        disabled: undeletable,
        run: () => handlers.onCut(id),
      },
      {
        label: t('붙여넣기'),
        icon: <ClipboardPaste size={17} />,
        shortcut: mod('V'),
        disabled: !handlers.canPaste,
        run: () => handlers.onPaste(id),
      },
      {
        label: t('복제'),
        icon: <CopyPlus size={17} />,
        shortcut: mod('D'),
        disabled: !children.length,
        run: () => handlers.onDuplicate(id),
      },
    ],
    arrange: [
      {
        label: t('위로 이동'),
        icon: <ArrowUp size={17} />,
        shortcut: { label: 'Alt ↑', aria: 'Alt+ArrowUp' },
        disabled: group || index < 1,
        run: () => handlers.onReorder(id, -1),
      },
      {
        label: t('아래로 이동'),
        icon: <ArrowDown size={17} />,
        shortcut: { label: 'Alt ↓', aria: 'Alt+ArrowDown' },
        disabled: group || root || index === siblings.length - 1,
        run: () => handlers.onReorder(id, 1),
      },
      {
        label: t('노드 이동'),
        icon: <ListTree size={17} />,
        disabled: !children.length,
        run: () => handlers.openTool('move'),
      },
      {
        label: t('왼쪽 배치'),
        icon: <ArrowLeft size={17} />,
        disabled: onSide('left'),
        run: () => handlers.onSide(id, 'left'),
      },
      {
        label: t('오른쪽 배치'),
        icon: <ArrowRight size={17} />,
        disabled: onSide('right'),
        run: () => handlers.onSide(id, 'right'),
      },
      {
        label: node.collapsed ? t('펼치기') : t('접기'),
        icon: node.collapsed ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onToggle(id),
      },
    ],
    view: [
      {
        label: t('이 가지만 보기'),
        icon: <Crosshair size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onFocus(id),
      },
      {
        label: t('하위 모두 펼치기'),
        icon: <ChevronsUpDown size={17} />,
        disabled: !node.children.length,
        run: () => handlers.onExpandAll(id),
      },
    ],
    remove: [
      {
        label: group
          ? t('선택한 노드 {count}개 삭제', { count: selection.length })
          : t('노드 삭제'),
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
        label: t('실행 취소'),
        icon: <Undo2 size={17} />,
        shortcut: mod('Z'),
        disabled: !handlers.canUndo,
        run: handlers.onUndo,
      },
      {
        label: t('다시 실행'),
        icon: <Redo2 size={17} />,
        shortcut: { label: 'Ctrl/⌘ Shift Z', aria: 'Control+Shift+Z Meta+Shift+Z' },
        disabled: !handlers.canRedo,
        run: handlers.onRedo,
      },
    ],
    edit: [
      ...(handlers.onAddTopic
        ? [{ label: t('여기에 새 주제'), icon: <SquarePlus size={17} />, run: handlers.onAddTopic }]
        : []),
      {
        label: t('선택한 노드에 붙여넣기'),
        icon: <ClipboardPaste size={17} />,
        shortcut: mod('V'),
        disabled: !handlers.canPaste,
        run: handlers.onPaste,
      },
      {
        label: t('모두 선택'),
        icon: <BoxSelect size={17} />,
        shortcut: mod('A'),
        run: handlers.onSelectAll,
      },
      {
        label: t('찾기'),
        icon: <Search size={17} />,
        shortcut: mod('F'),
        run: handlers.onSearch,
      },
    ],
    levels: [
      {
        label: t('모두 펼치기'),
        icon: <ChevronsUpDown size={17} />,
        run: () => handlers.onLevels(null),
      },
      {
        label: t('주 가지만 보기'),
        icon: <ListCollapse size={17} />,
        run: () => handlers.onLevels(2),
      },
      {
        label: t('2단계까지 보기'),
        icon: <ListTree size={17} />,
        run: () => handlers.onLevels(3),
      },
      {
        label: t('3단계까지 보기'),
        icon: <ListTree size={17} />,
        run: () => handlers.onLevels(4),
      },
    ],
    display: [
      ...(handlers.focused
        ? [{ label: t('전체 맵 보기'), icon: <Eye size={17} />, run: handlers.onExitFocus }]
        : []),
      {
        label: handlers.minimap ? t('미니맵 숨기기') : t('미니맵 보기'),
        icon: handlers.minimap ? <EyeOff size={17} /> : <MapIcon size={17} />,
        run: handlers.onToggleMinimap,
      },
    ],
    layout: [
      { label: t('자동 배치'), icon: <WandSparkles size={17} />, run: handlers.onArrange },
      {
        label: t('화면에 맞추기'),
        icon: <Focus size={17} />,
        shortcut: mod('0'),
        run: handlers.onFit,
      },
      { label: t('확대'), icon: <ZoomIn size={17} />, shortcut: mod('+'), run: handlers.onZoomIn },
      {
        label: t('축소'),
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
