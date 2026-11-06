import type { CSSProperties } from 'react';
import { FONT_FAMILIES, type nodeTypography } from '../../../domain/style/typography';
import type { Box } from '../../../engine/geometry';
import { NODE_PADDING_X, NODE_PADDING_Y } from '../../../engine/render-metrics';

type Typography = ReturnType<typeof nodeTypography>;

/** How a node is shown right now, beyond its own data. */
export interface NodeFlags {
  root: boolean;
  /** In the selection. */
  chosen: boolean;
  /** In a selection of several nodes. */
  multi: boolean;
  dragging: boolean;
  /** A drop would make it the parent (`child`) or insert beside it (`sibling`). */
  drop: 'child' | 'sibling' | null;
  match: boolean;
  taskDone: boolean;
  bold: boolean;
  customBackground: boolean;
}

export function nodeClassNames(flags: NodeFlags): string {
  return [
    'mind-node',
    flags.root && 'root-node',
    flags.chosen && 'selected',
    flags.multi && 'multi',
    flags.dragging && 'dragging',
    flags.drop === 'child' && 'drop-target',
    flags.drop === 'sibling' && 'drop-sibling',
    flags.match && 'search-match',
    flags.taskDone && 'task-done',
    flags.bold && 'bold-node',
    flags.customBackground && 'custom-bg',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Inline style of a node box: its laid-out place, typography and chosen colors. Default
 * colors come from the theme; chosen pastel colors stay as they are.
 */
export function nodeStyle(
  box: Box,
  typography: Typography,
  colors: { border: string | null; background: string },
): CSSProperties {
  return {
    '--node-padding-x': `${NODE_PADDING_X}px`,
    '--node-padding-y': `${NODE_PADDING_Y}px`,
    textAlign: typography.textAlign,
    fontSize: typography.fontSize,
    fontFamily: FONT_FAMILIES[typography.fontFamily],
    fontWeight: typography.bold ? 700 : undefined,
    fontStyle: typography.italic ? 'italic' : undefined,
    '--node-border-color': colors.border ?? undefined,
    lineHeight: `${typography.lineHeight}px`,
    left: box.x,
    top: box.y,
    width: box.width,
    minHeight: box.height,
    background: colors.background || undefined,
  } as CSSProperties;
}

/** Notes shown in a tooltip are cut to a readable length. */
export const notesPreview = (notes: string) =>
  notes.length > 200 ? `${notes.slice(0, 200)}…` : notes;
