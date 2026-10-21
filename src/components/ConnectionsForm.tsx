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
        <ul className="connection-list" aria-label={t('nodeTools.connectionList')}>
          {links.map((link) => {
            const outgoing = link.from === id;
            const other = map.nodes[outgoing ? link.to : link.from];
            return (
              <li key={`${link.from}>${link.to}`}>
                {outgoing ? (
                  <ArrowRight size={15} aria-label={t('nodeTools.outgoing')} />
                ) : (
                  <ArrowLeft size={15} aria-label={t('nodeTools.incoming')} />
                )}
                <span title={other.title}>{other.title}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('nodeTools.removeConnection', { title: other.title })}
                  onClick={() => onDisconnect(link.from, link.to)}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t('nodeTools.connectionsHint')}</p>
      )}
      <label htmlFor="connection-target">{t('nodeTools.connectTo')}</label>
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
          {t('nodeTools.addConnection')}
        </button>
      </div>
    </form>
  );
}
