import type { JsonObject } from './model';

/** Icons offered in the Style dialog; other stored values are kept but not shown. */
export const NODE_ICONS = ['⭐', '✅', '❗', '❓', '💡', '🔥', '📌', '⚠️', '🎯', '📅'] as const;
export type NodeTask = 'todo' | 'done';
export const TASK_SIZE = 16;
export const MARKER_GAP = 6;

/** The markers shown before a node's text and the width they take, in pixels. */
export function nodeMarkers(style: JsonObject, fontSize: number) {
  const icon = (NODE_ICONS as readonly unknown[]).includes(style.icon)
    ? (style.icon as string)
    : null;
  const task: NodeTask | null = style.task === 'todo' || style.task === 'done' ? style.task : null;
  const iconSize = Math.round(fontSize * 1.25);
  const width = (task ? TASK_SIZE + MARKER_GAP : 0) + (icon ? iconSize + MARKER_GAP : 0);
  return { icon, task, iconSize, width };
}
