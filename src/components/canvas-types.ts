import type { ResizeAction } from './useNodeResize';
import type { Ref } from 'react';
import type { MindMap, NodePosition, Side } from '../domain/model';

export interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}
export interface CanvasControls {
  zoomIn(): void;
  zoomOut(): void;
  fit(): CanvasView;
  getView(): CanvasView;
  restoreView(view: CanvasView): void;
  /** Map coordinates under a screen point. */
  toMap(clientX: number, clientY: number): NodePosition;
}

export interface CanvasProps {
  map: MindMap;
  /** The focused node; menus, editing and keyboard navigation act on it. */
  selected: string;
  /** Every selected node, including `selected`. */
  selection: string[];
  documentKey: number;
  /** Select only `id`. */
  onSelect(id: string): void;
  /** Add `id` to the selection or remove it (Shift/Ctrl/⌘-click). */
  onToggleSelect(id: string): void;
  onSelectNodes(ids: string[], primary: string): void;
  onEdit(id?: string): void;
  editingId: string | null;
  onRename(id: string, title: string): boolean;
  onCancelEdit(): void;
  controlsRef: Ref<CanvasControls>;
  onZoomChange(zoom: number): void;
  onAdd(sibling?: boolean): void;
  onDelete(): void;
  onToggle(id: string): void;
  onResize: ResizeAction;
  onReposition(positions: Record<string, NodePosition>): boolean;
  /**
   * Drop branches under a parent: beside `anchor` when given, otherwise as last children.
   * `side` applies when the parent is a root.
   */
  onReparent(
    ids: string[],
    parentId: string,
    side: Side,
    anchor?: { id: string; after: boolean },
  ): boolean;
  onContextMenu(id: string, at: { x: number; y: number }): void;
  onToggleTask(id: string): void;
  /** Show only this branch. */
  focusId?: string | null;
  /** Nodes matching the find bar. */
  matches?: ReadonlySet<string>;
  minimap?: boolean;
  /** Right-click on empty canvas. */
  onCanvasMenu(at: { x: number; y: number }): void;
  onCopy(id: string): string | null;
  onCut(id: string): string | null;
  onPaste(id: string, text?: string): void;
  onDuplicate(id: string): void;
  onReorder(id: string, offset: -1 | 1): void;
}
