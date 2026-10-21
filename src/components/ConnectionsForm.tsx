import { useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { MindMap } from '../domain/model';
import { useI18n } from '../i18n/react';

/** Cross-links from and to one node, with a picker to add another. */
export function ConnectionsForm({
  map,
  id,
  onConnect,
  onDisconnect,
}: {
  map: MindMap;
  id: string;
  onConnect(from: string, to: string): boolean;
  onDisconnect(from: string, to: string): boolean;
}) {
  const { t } = useI18n();
  const links = (map.connections ?? []).filter((link) => link.from === id || link.to === id);
  const linked = new Set(links.filter((link) => link.from === id).map((link) => link.to));
  const candidates = Object.values(map.nodes).filter(
    (node) => node.id !== id && !linked.has(node.id),
  );
  const [target, setTarget] = useState(candidates[0]?.id ?? '');
  const chosen = candidates.some((node) => node.id === target) ? target : (candidates[0]?.id ?? '');
  return (
    <form
      className="connections-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen) onConnect(id, chosen);
      }}
    >
      {links.length ? (
        <ul className="connection-list" aria-label={t('이 노드의 연결선')}>
          {links.map((link) => {
            const outgoing = link.from === id;
            const other = map.nodes[outgoing ? link.to : link.from];
            return (
              <li key={`${link.from}>${link.to}`}>
                {outgoing ? (
                  <ArrowRight size={15} aria-label={t('보내는 연결')} />
                ) : (
                  <ArrowLeft size={15} aria-label={t('받는 연결')} />
                )}
                <span title={other.title}>{other.title}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('{title} 연결선 삭제', { title: other.title })}
                  onClick={() => onDisconnect(link.from, link.to)}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t('다른 가지의 노드와 화살표로 이어 관계를 표시합니다.')}</p>
      )}
      <label htmlFor="connection-target">{t('연결할 노드')}</label>
      <select
        id="connection-target"
        data-autofocus
        value={chosen}
        disabled={!candidates.length}
        onChange={(event) => setTarget(event.target.value)}
      >
        {candidates.map((node) => (
          <option key={node.id} value={node.id}>
            {node.title.slice(0, 70)}
          </option>
        ))}
      </select>
      <div className="dialog-actions">
        <button className="button primary" type="submit" disabled={!chosen}>
          {t('연결선 추가')}
        </button>
      </div>
    </form>
  );
}
