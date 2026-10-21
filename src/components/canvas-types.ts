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
  /** Drop branches onto a new parent; `side` applies when the parent is a root. */
  onReparent(ids: string[], parentId: string, side: Side): boolean;
  onContextMenu(id: string, at: { x: number; y: number }): void;
  /** Right-click on empty canvas. */
  onCanvasMenu(at: { x: number; y: number }): void;
  onCopy(id: string): string | null;
  onCut(id: string): string | null;
  onPaste(id: string, text?: string): void;
  onDuplicate(id: string): void;
  onReorder(id: string, offset: -1 | 1): void;
}
