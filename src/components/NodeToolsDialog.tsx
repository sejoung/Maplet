import { useI18n } from '../i18n/react';
import type { ComponentType } from 'react';
import type { MindMap } from '../domain/model';
import { plainTitle } from '../domain/rich-text';
import { Dialog } from './Dialog';
import { NodeStyleForm } from './NodeStyleForm';
import { ConnectionsForm } from './ConnectionsForm';
import {
  LinkForm,
  MoveForm,
  NotesForm,
  type NodeToolActions,
  type NodeToolFormProps,
} from './NodeToolForms';

export type { NodeToolActions } from './NodeToolForms';
export type NodeTool = 'notes' | 'link' | 'style' | 'move' | 'connections';

/** Each tool's title and form; `group` tools act on every selected node. */
const TOOLS: Record<
  NodeTool,
  { title: string; group?: boolean; Form: ComponentType<NodeToolFormProps> }
> = {
  notes: { title: 'common.notes', Form: NotesForm },
  link: { title: 'common.link', Form: LinkForm },
  style: {
    title: 'nodeTools.nodeStyle',
    group: true,
    Form: ({ node, onUpdate, onClose }) => (
      <NodeStyleForm
        initialStyle={node.style}
        onApply={(style) => onUpdate(node.id, { style })}
        onClose={onClose}
      />
    ),
  },
  move: { title: 'common.moveNode', group: true, Form: MoveForm },
  connections: {
    title: 'common.connections',
    Form: ({ map, node, onConnect, onDisconnect }) => (
      <ConnectionsForm map={map} id={node.id} onConnect={onConnect} onDisconnect={onDisconnect} />
    ),
  },
};

export function NodeToolsDialog({
  tool,
  map,
  selected,
  selection = [selected],
  onClose,
  ...actions
}: NodeToolActions & {
  tool: NodeTool;
  map: MindMap;
  selected: string;
  /** Style and move apply to every selected node; notes and links to `selected` only. */
  selection?: string[];
  onClose(): void;
}) {
  const { t } = useI18n();
  const node = map.nodes[selected];
  const { title, group: acrossSelection, Form } = TOOLS[tool];
  const group = acrossSelection === true && selection.length > 1;
  const name = plainTitle(node.title);
  return (
    <Dialog title={t(title)} onClose={onClose}>
      <p className="tool-selection" title={name}>
        {group
          ? t('nodeTools.selectionSummary', { title: name, count: selection.length - 1 })
          : name}
      </p>
      <Form
        {...actions}
        map={map}
        node={node}
        targets={group ? selection : [selected]}
        onClose={onClose}
      />
    </Dialog>
  );
}
