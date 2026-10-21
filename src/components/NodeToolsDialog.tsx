import { useI18n } from '../i18n/react';
import { useState } from 'react';
import type { MindMap, MindNode } from '../domain/model';
import { isDescendant, safeUrl } from '../domain/commands';
import { Dialog } from './Dialog';
import { NodeStyleForm } from './NodeStyleForm';
import { ConnectionsForm } from './ConnectionsForm';

export type NodeTool = 'notes' | 'link' | 'style' | 'move' | 'connections';
export interface NodeToolActions {
  onUpdate(
    id: string,
    patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>,
  ): boolean;
  onMove(id: string, parent: string): boolean;
  onConnect(from: string, to: string): boolean;
  onDisconnect(from: string, to: string): boolean;
}
const titles: Record<NodeTool, string> = {
  notes: 'common.notes',
  link: 'common.link',
  style: 'nodeTools.nodeStyle',
  move: 'common.moveNode',
  connections: 'common.connections',
};

export function NodeToolsDialog({
  tool,
  map,
  selected,
  selection = [selected],
  onUpdate,
  onMove,
  onConnect,
  onDisconnect,
  onClose,
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
  const group = selection.length > 1 && (tool === 'style' || tool === 'move');
  const moving = group ? selection : [selected];
  const [notes, setNotes] = useState(node.notes);
  const [link, setLink] = useState(node.links[0] ?? '');
  const parents = Object.values(map.nodes).filter((candidate) =>
    moving.every((id) => candidate.id !== id && !isDescendant(map, id, candidate.id)),
  );
  const [parent, setParent] = useState(() =>
    parents.some((candidate) => candidate.id === node.parentId)
      ? node.parentId!
      : (parents[0]?.id ?? ''),
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={t(titles[tool])} onClose={onClose}>
      <p className="tool-selection" title={node.title}>
        {group
          ? t('nodeTools.selectionSummary', { title: node.title, count: selection.length - 1 })
          : node.title}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {tool === 'notes' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (onUpdate(selected, { notes })) onClose();
          }}
        >
          <label htmlFor="node-notes">{t('common.notes')}</label>
          <textarea
            id="node-notes"
            data-autofocus
            rows={7}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="dialog-actions">
            <button className="button" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="button primary" type="submit">
              {t('nodeTools.saveNotes')}
            </button>
          </div>
        </form>
      )}
      {tool === 'link' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = link.trim();
            if (value && !safeUrl(value)) {
              setError('common.linksMustUseHttpHttps');
              return;
            }
            if (onUpdate(selected, { links: value ? [value] : [] })) onClose();
          }}
        >
          <label htmlFor="node-link">{t('common.link')}</label>
          <input
            id="node-link"
            data-autofocus
            placeholder="https://"
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setError(null);
            }}
          />
          {node.links[0] && safeUrl(node.links[0]) && (
            <a
              className="external-link"
              href={node.links[0]}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('nodeTools.openCurrentLink')}
            </a>
          )}
          <div className="dialog-actions">
            <button className="button" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="button primary" type="submit">
              {t('nodeTools.applyLink')}
            </button>
          </div>
        </form>
      )}
      {tool === 'style' && (
        <NodeStyleForm
          initialStyle={node.style}
          onApply={(style) => onUpdate(selected, { style })}
          onClose={onClose}
        />
      )}
      {tool === 'move' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (onMove(selected, parent)) onClose();
          }}
        >
          <label htmlFor="parent-node">{t('nodeTools.parentNode')}</label>
          <select
            id="parent-node"
            data-autofocus
            value={parent}
            onChange={(event) => setParent(event.target.value)}
          >
            {parents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title.slice(0, 70)}
              </option>
            ))}
          </select>
          <div className="dialog-actions">
            <button className="button" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="button primary" type="submit">
              {t('nodeTools.moveSubmit')}
            </button>
          </div>
        </form>
      )}
      {tool === 'connections' && (
        <ConnectionsForm
          map={map}
          id={selected}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      )}
    </Dialog>
  );
}
