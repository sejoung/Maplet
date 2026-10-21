import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useI18n } from '../i18n/react';
import type { DriveMergeConflict } from './driveMerge';
import type { MergeChoices } from '../domain/merge';
import { parseMaplet } from '../adapters/maplet/codec';
import { own } from '../domain/ids';

const labels: Record<string, string> = {
  title: 'common.nodeTitle',
  notes: 'common.notes',
  links: 'common.link',
  position: 'drive.position',
  parentId: 'drive.parentNode',
  rank: 'drive.nodeOrder',
  side: 'drive.direction',
  collapsed: 'common.collapse',
  style: 'drive.style',
  filename: 'common.fileName',
  structure: 'drive.nodeStructure',
  document: 'drive.document',
  background: 'common.backgroundColor',
  color: 'drive.textColor',
  fontFamily: 'common.font',
  fontSize: 'common.fontSize',
  fontWeight: 'drive.fontWeight',
  textAlign: 'common.textAlignment',
  width: 'drive.width',
  group: 'drive.groupPositions',
};
export function DriveMergeDialog({
  conflict,
  busy,
  resolve,
  close,
  download,
  copy,
}: {
  conflict: DriveMergeConflict;
  busy: boolean;
  resolve(choices: MergeChoices): void;
  close(): void;
  download(): void;
  copy(): void;
}) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<{
    conflict: DriveMergeConflict;
    choices: MergeChoices;
  }>({ conflict, choices: {} });
  const choices = selection.conflict === conflict ? selection.choices : {};
  const local = parseMaplet(conflict.local.content),
    remote = parseMaplet(conflict.remote.content);
  const value = (item: unknown) =>
    item === undefined
      ? t('drive.deleted')
      : typeof item === 'string'
        ? item
        : JSON.stringify(item, null, 2);
  return (
    <Dialog title={t('drive.reviewConflictingChanges')} onClose={close}>
      <p>{t('drive.nonConflictingChangesHaveMerged')}</p>
      <div className="merge-conflicts">
        {conflict.conflicts.map((item, index) => {
          const node =
            item.nodeId && (own(local.nodes, item.nodeId) ?? own(remote.nodes, item.nodeId));
          const field =
            item.path.map((part) => t(labels[part] ?? part)).join(' · ') ||
            t('drive.nodeDeletionEdit');
          return (
            <fieldset key={item.id} className="merge-conflict">
              <legend>{node ? `${node.title} · ${field}` : field}</legend>
              <details>
                <summary>{t('drive.lastSyncedContent')}</summary>
                <pre>{value(item.base)}</pre>
              </details>
              {(['local', 'remote'] as const).map((side) => (
                <label key={side} className="merge-choice">
                  <span>
                    <input
                      type="radio"
                      name={`merge-${index}`}
                      value={side}
                      checked={choices[item.id] === side}
                      onChange={() =>
                        setSelection({ conflict, choices: { ...choices, [item.id]: side } })
                      }
                    />
                    {t(side === 'local' ? 'drive.keepMyChange' : 'drive.keepDriveChange')}
                  </span>
                  <pre>{value(item[side])}</pre>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="drive-actions">
        <button
          className="button primary"
          disabled={busy || conflict.conflicts.some((item) => !choices[item.id])}
          onClick={() => resolve(choices)}
        >
          {t('drive.mergeSelectionsSave')}
        </button>
        <button className="button" disabled={busy} onClick={download}>
          {t('drive.downloadLocalFile')}
        </button>
        <button className="button" disabled={busy} onClick={copy}>
          {t('drive.saveNewCopy')}
        </button>
        <button className="button quiet" onClick={close}>
          {t('drive.backEditing')}
        </button>
      </div>
    </Dialog>
  );
}
