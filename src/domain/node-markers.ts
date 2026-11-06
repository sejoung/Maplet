import type { JsonObject } from './model';
import { isOneOf } from './guards';

/** Icons offered in the Style dialog; other stored values are kept but not shown. */
export const NODE_ICONS = ['⭐', '✅', '❗', '❓', '💡', '🔥', '📌', '⚠️', '🎯', '📅'] as const;
export const NODE_TASKS = ['todo', 'done'] as const;
export type NodeIcon = (typeof NODE_ICONS)[number];
export type NodeTask = (typeof NODE_TASKS)[number];

/** The markers shown before a node's text; their sizes belong to the renderers. */
export function nodeMarkers(style: JsonObject): { icon: NodeIcon | null; task: NodeTask | null } {
  return {
    icon: isOneOf(NODE_ICONS, style.icon) ? style.icon : null,
    task: isOneOf(NODE_TASKS, style.task) ? style.task : null,
  };
}
