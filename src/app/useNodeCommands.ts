import {
  addNode,
  addRoot,
  deleteNodes,
  insertNodes,
  renameNode,
  showLevels,
  updateNode,
} from '../domain/commands';
import { addConnection, removeConnection } from '../domain/connections';
import type { MindMap, MindNode, NodePosition } from '../domain/model';
import { resizeNode } from '../domain/node-size';
import { setNodePositions } from '../domain/positions';
import { moveNodes, topLevel, updateNodes, visibleSelection } from '../domain/selection';
import { autoArrange } from '../engine/auto-arrange';
import { layoutMap } from '../engine/layout';
import { measureNodeText } from '../components/text-measure';
import { filenameFromTitle } from '../application/document-name';
import type { useI18n } from '../i18n/react';
import type { DocumentState } from './useDocument';

type NodePatch = Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>;

/** Nearest ancestor-or-self of `id` that is not hidden in a collapsed branch. */
function visibleAncestor(map: MindMap, id: string): string {
  let visible = id;
  for (let parent = map.nodes[id].parentId; parent; parent = map.nodes[parent].parentId)
    if (map.nodes[parent].collapsed) visible = parent;
  return visible;
}

/** Editing commands on nodes and the map structure, wired to the open document. */
export function useNodeCommands(doc: DocumentState, t: ReturnType<typeof useI18n>['t']) {
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
  const remove = () => {
    const ids = doc.targets(selected);
    const nodes = ids.map((id) => map.nodes[id]);
    const confirmText =
      ids.length > 1
        ? t('app.confirmDeleteSelection', { count: doc.selection.length })
        : t('app.confirmDeleteBranch');
    if (nodes.some((node) => node.children.length) && !window.confirm(confirmText)) return;
    const fallback = nodes[0].parentId ?? map.roots.find((id) => !ids.includes(id))!;
    if (edit((current) => deleteNodes(current, ids))) doc.setSelected(fallback);
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
      const renamed = edit((current) => renameNode(current, id, title));
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
    onAutoLayout: () => edit((current) => autoArrange(current, measureNodeText)),
    /** A new central topic; placing one fixes the current layout so nothing else moves. */
    onAddRoot: (at?: NodePosition) => {
      const id = crypto.randomUUID();
      const added = edit((current) => {
        let base = current;
        if (at && !Object.values(current.nodes).some((node) => node.position)) {
          const placed = layoutMap(current, measureNodeText).nodes;
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
    onConnect: (from: string, to: string) => edit((current) => addConnection(current, from, to)),
    onDisconnect: (from: string, to: string) =>
      edit((current) => removeConnection(current, from, to)),
  };
}
export type NodeCommands = ReturnType<typeof useNodeCommands>;
