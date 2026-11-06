import {
  addNode,
  addRoot,
  deleteNodes,
  insertNodes,
  moveNodes,
  renameNode,
  showLevels,
  updateNode,
  updateNodes,
  type NodePatch,
} from '../domain/commands';
import { addConnection, removeConnection } from '../domain/connections';
import type { MindMap, MindNode, NodePosition } from '../domain/model';
import { resizeNode } from '../domain/node-size';
import { setNodePositions } from '../domain/positions';
import {
  fallbackAfterDelete,
  topLevel,
  visibleAncestor,
  visibleSelection,
} from '../domain/selection';
import { autoArrange } from '../engine/auto-arrange';
import { layoutMap } from '../engine/layout';
import type { TextMeasurer } from '../engine/node-measure';
import { filenameFromTitle } from '../application/document-name';
import type { FormatCommand } from '../domain/rich-text';
import { formatNodeTitles, withoutLegacyEmphasis } from '../domain/title-format';
import type { useI18n } from '../i18n/react';
import type { DocumentState } from './useDocument';

interface Options {
  t: ReturnType<typeof useI18n>['t'];
  /** Measures node text for automatic layout; the app passes the DOM measurer. */
  measure: TextMeasurer;
  /** A deletion removed more than one node. */
  onDeleted?(count: number): void;
}

/** Editing commands on nodes and the map structure, wired to the open document. */
export function useNodeCommands(doc: DocumentState, { t, measure, onDeleted = () => {} }: Options) {
  const { map, selectedId: selected, edit } = doc;
  const add = (sibling = false) => {
    const id = crypto.randomUUID();
    const added = edit((current) => {
      const node = current.nodes[selected];
      const asSibling = sibling && node.parentId !== null;
      return addNode(
        current,
        asSibling ? node.parentId! : selected,
        id,
        t('common.newNode'),
        asSibling ? selected : undefined,
      );
    });
    if (!added) return;
    doc.setSelected(id);
    doc.setEditingId(id);
  };
  // Deleting is undoable, so it acts at once and reports what went instead of asking first.
  const remove = () => {
    const ids = doc.targets(selected);
    const fallback = fallbackAfterDelete(map, ids);
    let removed = 0;
    const deleted = edit((current) => {
      const next = deleteNodes(current, ids);
      removed = Object.keys(current.nodes).length - Object.keys(next.nodes).length;
      return next;
    });
    if (!deleted) return;
    doc.setSelected(fallback);
    if (removed > 1) onDeleted(removed);
  };
  /** Apply a structural change and keep the focused node visible. */
  const reveal = (change: (current: MindMap) => MindMap) => {
    let next: MindMap | null = null;
    if (!edit((current) => (next = change(current)))) return;
    const shown = visibleSelection(next!, doc.selection);
    const focus = visibleAncestor(next!, selected);
    if (focus !== selected || shown.length !== doc.selection.length) doc.setSelected(focus);
  };
  return {
    onAdd: add,
    onDelete: remove,
    onToggle: (id: string) =>
      reveal((current) => updateNode(current, id, { collapsed: !current.nodes[id].collapsed })),
    onShowLevels: (depth: number | null, under?: string) =>
      reveal((current) => showLevels(current, depth, under)),
    onRename: (id: string, title: string) => {
      const renamed = edit((current) => {
        const next = renameNode(current, id, title);
        // The inline editor writes whole-node emphasis into the changed title.
        const style = withoutLegacyEmphasis(current.nodes[id].style);
        return next === current || style === current.nodes[id].style
          ? next
          : updateNode(next, id, { style });
      });
      if (renamed && doc.filenamePending && id === map.roots[0] && title !== map.nodes[id].title) {
        const name = filenameFromTitle(title);
        if (name) doc.rename(name);
      }
      if (renamed) doc.setEditingId(null);
      return renamed;
    },
    onUpdate: (id: string, patch: NodePatch) =>
      edit((current) =>
        updateNodes(current, doc.selection.includes(id) ? doc.selection : [id], id, patch),
      ),
    onMove: (id: string, parent: string) =>
      edit((current) => moveNodes(current, doc.targets(id), parent)),
    onReparent: (
      ids: string[],
      parent: string,
      side: MindNode['side'],
      anchor?: { id: string; after: boolean },
    ) =>
      edit((current) =>
        anchor
          ? insertNodes(current, topLevel(current, ids), parent, anchor)
          : moveNodes(current, ids, parent, side),
      ),
    onResize: (id: string, width: number | null, positions?: Record<string, NodePosition>) =>
      edit((current) => resizeNode(current, id, width, positions)),
    onReposition: (positions: Record<string, NodePosition>) =>
      edit((current) => setNodePositions(current, positions)),
    onAutoLayout: () => edit((current) => autoArrange(current, measure)),
    /** A new central topic; placing one fixes the current layout so nothing else moves. */
    onAddRoot: (at?: NodePosition) => {
      const id = crypto.randomUUID();
      const added = edit((current) => {
        let base = current;
        if (at && !Object.values(current.nodes).some((node) => node.position)) {
          const placed = layoutMap(current, measure).nodes;
          base = setNodePositions(
            current,
            Object.fromEntries(placed.map((node) => [node.id, { x: node.x, y: node.y }])),
          );
        }
        return addRoot(base, id, t('app.newTopic'), at);
      });
      if (!added) return;
      doc.setSelected(id);
      doc.setEditingId(id);
    },
    onToggleTask: (id: string) =>
      edit((current) => {
        const style = current.nodes[id].style;
        return updateNode(current, id, {
          style: { ...style, task: style.task === 'done' ? 'todo' : 'done' },
        });
      }),
    onFormatNodes: (command: FormatCommand) =>
      edit((current) => formatNodeTitles(current, doc.selection, command)),
    onConnect: (from: string, to: string) => edit((current) => addConnection(current, from, to)),
    onDisconnect: (from: string, to: string) =>
      edit((current) => removeConnection(current, from, to)),
  };
}
export type NodeCommands = ReturnType<typeof useNodeCommands>;
