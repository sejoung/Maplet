import { useState } from 'react';
import type { MindMap, MindNode } from '../../../domain/model';
import { moveTargets, safeUrl } from '../../../domain/commands';
import { plainTitle } from '../../../domain/rich-text/rich-text';
import { useI18n } from '../../../i18n/react';
import { DialogActions } from '../Dialog';

/** How the node tools apply their changes; each returns whether the change was made. */
export interface NodeToolActions {
  onUpdate(
    id: string,
    patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>,
  ): boolean;
  onMove(id: string, parent: string): boolean;
  onConnect(from: string, to: string): boolean;
  onDisconnect(from: string, to: string): boolean;
}

/** What every node tool form gets: the node, the nodes it acts on, and how to apply. */
export interface NodeToolFormProps extends NodeToolActions {
  map: MindMap;
  node: MindNode;
  /** The nodes the tool acts on: the whole selection for group tools, else `node` only. */
  targets: string[];
  onClose(): void;
}

export function NotesForm({ node, onUpdate, onClose }: NodeToolFormProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState(node.notes);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (onUpdate(node.id, { notes })) onClose();
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
      <DialogActions onCancel={onClose} submitLabel={t('nodeTools.saveNotes')} />
    </form>
  );
}

export function LinkForm({ node, onUpdate, onClose }: NodeToolFormProps) {
  const { t } = useI18n();
  const [link, setLink] = useState(node.links[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const current = node.links[0];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = link.trim();
        if (value && !safeUrl(value)) {
          setError('common.linksMustUseHttpHttps');
          return;
        }
        if (onUpdate(node.id, { links: value ? [value] : [] })) onClose();
      }}
    >
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
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
      {current && safeUrl(current) && (
        <a className="external-link" href={current} target="_blank" rel="noopener noreferrer">
          {t('nodeTools.openCurrentLink')}
        </a>
      )}
      <DialogActions onCancel={onClose} submitLabel={t('nodeTools.applyLink')} />
    </form>
  );
}

export function MoveForm({ map, node, targets, onMove, onClose }: NodeToolFormProps) {
  const { t } = useI18n();
  const parents = moveTargets(map, targets);
  // Starts on the current parent when every moved node may stay there.
  const [parent, setParent] = useState(() =>
    parents.some((candidate) => candidate.id === node.parentId)
      ? node.parentId!
      : (parents[0]?.id ?? ''),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (onMove(node.id, parent)) onClose();
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
            {plainTitle(candidate.title).slice(0, 70)}
          </option>
        ))}
      </select>
      <DialogActions onCancel={onClose} submitLabel={t('nodeTools.moveSubmit')} />
    </form>
  );
}
