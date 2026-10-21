import { useI18n } from '../i18n/react';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { MindMap, MindNode } from '../domain/model';
import { isDescendant, safeUrl } from '../domain/commands';
import { Dialog } from './Dialog';
import { NodeStyleForm } from './NodeStyleForm';

export type NodeTool = 'notes' | 'link' | 'style' | 'move' | 'search';
export interface NodeToolActions {
  onUpdate(
    id: string,
    patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>,
  ): boolean;
  onMove(id: string, parent: string): boolean;
}
const titles: Record<NodeTool, string> = {
  notes: '메모',
  link: '링크',
  style: '노드 서식',
  move: '노드 이동',
  search: '찾기',
};

export function NodeToolsDialog({
  tool,
  map,
  selected,
  onUpdate,
  onMove,
  onSelect,
  onClose,
}: NodeToolActions & {
  tool: NodeTool;
  map: MindMap;
  selected: string;
  onSelect(id: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const node = map.nodes[selected];
  const [notes, setNotes] = useState(node.notes);
  const [link, setLink] = useState(node.links[0] ?? '');
  const [parent, setParent] = useState(node.parentId ?? '');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? Object.values(map.nodes).filter((candidate) =>
          candidate.title.toLocaleLowerCase().includes(term),
        )
      : null;
  }, [map, query]);
  return (
    <Dialog title={t(titles[tool])} onClose={onClose}>
      {tool !== 'search' && (
        <p className="tool-selection" title={node.title}>
          {node.title}
        </p>
      )}
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
            {Object.values(map.nodes)
              .filter(
                (candidate) =>
                  candidate.id !== selected && !isDescendant(map, selected, candidate.id),
              )
              .map((candidate) => (
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
      {tool === 'search' && (
        <>
          <label htmlFor="node-search">{t('노드 검색')}</label>
          <div className="search-field">
            <Search size={17} />
            <input
              id="node-search"
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('검색어 입력')}
            />
          </div>
          <div className="search-results" aria-live="polite">
            {matches ? (
              matches.map((candidate) => (
                <button
                  className="search-result"
                  key={candidate.id}
                  onClick={() => {
                    onSelect(candidate.id);
                    onClose();
                  }}
                >
                  {candidate.title}
                </button>
              ))
            ) : (
              <p className="muted">{t('제목으로 노드를 검색합니다.')}</p>
            )}
            {matches?.length === 0 && <p className="muted">{t('검색 결과가 없습니다.')}</p>}
          </div>
        </>
      )}
    </Dialog>
  );
}
