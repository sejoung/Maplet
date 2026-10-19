import type { ResizeAction } from './useNodeResize';
import type { Ref } from 'react';
import type { MindMap, NodePosition } from '../domain/model';

export interface CanvasControls {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
}

export interface CanvasProps {
  map: MindMap;
  selected: string;
  documentKey: number;
  onSelect(id: string): void;
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
}
