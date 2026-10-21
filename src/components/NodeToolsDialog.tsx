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
  notes: '메모',
  link: '링크',
  style: '노드 서식',
  move: '노드 이동',
  connections: '연결선',
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
          ? t('{title} 외 {count}개', { title: node.title, count: selection.length - 1 })
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
          <label htmlFor="node-notes">{t('메모')}</label>
          <textarea
            id="node-notes"
            data-autofocus
            rows={7}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="dialog-actions">
            <button className="button" type="button" onClick={onClose}>
              {t('취소')}
            </button>
            <button className="button primary" type="submit">
              {t('메모 저장')}
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
              setError('링크는 http, https 또는 mailto 주소만 사용할 수 있습니다.');
              return;
            }
            if (onUpdate(selected, { links: value ? [value] : [] })) onClose();
          }}
        >
          <label htmlFor="node-link">{t('링크')}</label>
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
              {t('현재 링크 열기 ↗')}
            </a>
          )}
          <div className="dialog-actions">
            <button className="button" type="button" onClick={onClose}>
              {t('취소')}
            </button>
            <button className="button primary" type="submit">
              {t('링크 적용')}
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
          <label htmlFor="parent-node">{t('상위 노드')}</label>
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
              {t('취소')}
            </button>
            <button className="button primary" type="submit">
              {t('이동')}
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
