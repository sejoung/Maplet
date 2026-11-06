import { useState } from 'react';
import { Dialog } from '../dialogs/Dialog';
import { useI18n } from '../../i18n/react';
import type { MergeChoices, MergeConflict } from '../../domain/merge/merge';

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
/** Pick a side for each property both this map and Drive changed. */
export function DriveMergeDialog({
  conflicts,
  titles,
  busy,
  resolve,
  close,
  download,
  copy,
}: {
  conflicts: MergeConflict[];
  /** The title of the node each conflict concerns, by index; null for the document. */
  titles: (string | null)[];
  busy: boolean;
  resolve(choices: MergeChoices): void;
  close(): void;
  download(): void;
  copy(): void;
}) {
  const { t } = useI18n();
  // Choices belong to one set of conflicts; a re-merge starts a fresh selection.
  const [selection, setSelection] = useState<{
    conflicts: MergeConflict[];
    choices: MergeChoices;
  }>({ conflicts, choices: {} });
  const choices = selection.conflicts === conflicts ? selection.choices : {};
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
        {conflicts.map((item, index) => {
          const title = titles[index];
          const field =
            item.path.map((part) => t(labels[part] ?? part)).join(' · ') ||
            t('drive.nodeDeletionEdit');
          return (
            <fieldset key={item.id} className="merge-conflict">
              <legend>{title === null ? field : `${title} · ${field}`}</legend>
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
                        setSelection({ conflicts, choices: { ...choices, [item.id]: side } })
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
          disabled={busy || conflicts.some((item) => !choices[item.id])}
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
